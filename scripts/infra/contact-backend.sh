#!/usr/bin/env bash
# scripts/infra/contact-backend.sh - idempotent provisioning for the contact
# relay: IAM role -> Lambda (reserved concurrency 1) -> Function URL (AWS_IAM)
# -> CloudFront OAC + /api/contact behavior on the existing distribution.
# Safe to re-run: every step diffs current state before writing.
# Style: matches the CloudFront error-page scripts (aws cli + jq, no state).
set -euo pipefail
trap 'rm -f "${ZIP:-}"; rm -rf "${TMP:-}"; rm -f /tmp/contact-smoke.json' EXIT

REGION="us-east-1"
FUNC="portfolio-contact"
ROLE="portfolio-contact-role"
DIST_ID="E1XPOJ09AWDJIN"
SES_IDENTITY="me@lucasluize.com"
LAMBDA_DIR="$(cd "$(dirname "$0")/lambda" && pwd)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

say() { printf '\n== %s\n' "$*"; }

# --- 0. preflight: SES identity must be verified ---------------------------
say "checking SES identity"
STATUS=$(aws sesv2 get-email-identity --email-identity "$SES_IDENTITY" --region "$REGION" \
  --query 'VerifiedForSendingStatus' --output text 2>/dev/null || echo "MISSING")
if [ "$STATUS" != "True" ]; then
  echo "SES identity $SES_IDENTITY not verified. Run:"
  echo "  aws sesv2 create-email-identity --email-identity $SES_IDENTITY --region $REGION"
  echo "then click the verification link in your inbox and re-run this script."
  exit 1
fi

# --- 1. IAM role ------------------------------------------------------------
say "ensuring IAM role $ROLE"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam wait role-exists --role-name "$ROLE"
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name contact-relay --policy-document "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ses:SendEmail\",\"Resource\":\"arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/${SES_IDENTITY}\"},
    {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:*\"}
  ]}"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE}"

# --- 2. Lambda function ------------------------------------------------------
say "packaging lambda"
ZIP="$(mktemp -t contact-lambda-XXXX.zip)"
rm -f "$ZIP"
(cd "$LAMBDA_DIR" && zip -q -j "$ZIP" index.js handler.js)

if aws lambda get-function --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  say "updating function code"
  aws lambda update-function-code --function-name "$FUNC" --zip-file "fileb://$ZIP" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
else
  say "creating function"
  # role propagation can lag right after create-role; retry briefly
  for i in 1 2 3 4 5; do
    if aws lambda create-function --function-name "$FUNC" --runtime nodejs22.x \
      --handler index.handler --role "$ROLE_ARN" --zip-file "fileb://$ZIP" \
      --timeout 10 --memory-size 128 --region "$REGION" >/dev/null 2>&1; then break; fi
    echo "  role not ready yet, retrying ($i/5)"; sleep 10
  done
  aws lambda wait function-active --function-name "$FUNC" --region "$REGION"
fi
say "reserved concurrency = 1 (hard abuse/cost cap)"
aws lambda put-function-concurrency --function-name "$FUNC" --reserved-concurrent-executions 1 --region "$REGION" >/dev/null

# --- 3. Function URL (AWS_IAM) + CloudFront invoke permission ----------------
say "ensuring function URL (auth AWS_IAM)"
FURL=$(aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" \
  --query FunctionUrl --output text 2>/dev/null || true)
if [ -z "$FURL" ] || [ "$FURL" = "None" ]; then
  FURL=$(aws lambda create-function-url-config --function-name "$FUNC" \
    --auth-type AWS_IAM --region "$REGION" --query FunctionUrl --output text)
fi
FURL_DOMAIN=$(echo "$FURL" | sed -E 's|https://([^/]+)/?|\1|')
echo "  $FURL_DOMAIN"

say "granting CloudFront permission to invoke the URL"
aws lambda add-permission --function-name "$FUNC" --region "$REGION" \
  --statement-id cloudfront-oac-invoke \
  --action lambda:InvokeFunctionUrl \
  --principal cloudfront.amazonaws.com \
  --source-arn "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}" \
  >/dev/null 2>&1 || echo "  permission already present"

# --- 4. CloudFront OAC -------------------------------------------------------
say "ensuring lambda OAC"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='portfolio-contact-oac'].Id | [0]" --output text)
if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    'Name=portfolio-contact-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=lambda' \
    --query 'OriginAccessControl.Id' --output text)
fi
echo "  OAC: $OAC_ID"

# --- 5. Distribution: origin + behavior (diff-and-apply) ---------------------
say "patching distribution $DIST_ID"
TMP=$(mktemp -d -t contact-cf-XXXX)
aws cloudfront get-distribution-config --id "$DIST_ID" > "$TMP/full.json"
ETAG=$(jq -r '.ETag' "$TMP/full.json")
jq '.DistributionConfig' "$TMP/full.json" > "$TMP/config.json"

# CachingDisabled + AllViewerExceptHostHeader are AWS managed policy ids.
jq --arg dom "$FURL_DOMAIN" --arg oac "$OAC_ID" '
  .Origins.Items |= (map(select(.Id != "contact-lambda")) + [{
    "Id":"contact-lambda","DomainName":$dom,"OriginPath":"",
    "CustomHeaders":{"Quantity":0},
    "CustomOriginConfig":{"HTTPPort":80,"HTTPSPort":443,"OriginProtocolPolicy":"https-only",
      "OriginSslProtocols":{"Quantity":1,"Items":["TLSv1.2"]},
      "OriginReadTimeout":30,"OriginKeepaliveTimeout":5},
    "ConnectionAttempts":3,"ConnectionTimeout":10,
    "OriginShield":{"Enabled":false},
    "OriginAccessControlId":$oac
  }]) |
  .Origins.Quantity = (.Origins.Items | length) |
  .CacheBehaviors.Items = ((.CacheBehaviors.Items // []) | map(select(.PathPattern != "/api/contact")) + [{
    "PathPattern":"/api/contact","TargetOriginId":"contact-lambda",
    "ViewerProtocolPolicy":"https-only",
    "AllowedMethods":{"Quantity":7,"Items":["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods":{"Quantity":2,"Items":["GET","HEAD"]}},
    "Compress":false,
    "CachePolicyId":"4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId":"b689b0a8-53d0-40ab-baf2-68738e2966ac",
    "SmoothStreaming":false,
    "FieldLevelEncryptionId":"",
    "LambdaFunctionAssociations":{"Quantity":0},
    "FunctionAssociations":{"Quantity":0},
    "TrustedSigners":{"Enabled":false,"Quantity":0},
    "TrustedKeyGroups":{"Enabled":false,"Quantity":0}
  }]) |
  .CacheBehaviors.Quantity = (.CacheBehaviors.Items | length)
' "$TMP/config.json" > "$TMP/desired.json"

if jq -e -n --slurpfile a "$TMP/config.json" --slurpfile b "$TMP/desired.json" '$a == $b' >/dev/null; then
  echo "  distribution already up to date"
else
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
    --distribution-config "file://$TMP/desired.json" >/dev/null
  echo "  update submitted, waiting for deploy (a few minutes)..."
  aws cloudfront wait distribution-deployed --id "$DIST_ID"
fi

# --- 6. smoke test -----------------------------------------------------------
say "smoke test"
BODY='{"name":"Smoke Test","email":"smoke@lucasluize.com","subject":"contact-backend smoke","message":"provisioning smoke test - ignore","website":"","t":9999}'
HASH=$(python3 -c "import hashlib,sys;print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" "$BODY")
HTTP=$(curl -s -o /tmp/contact-smoke.json -w '%{http_code}' \
  -X POST "https://devops.lucasluize.com/api/contact" \
  -H "Content-Type: application/json" -H "x-amz-content-sha256: $HASH" \
  --data "$BODY")
cat /tmp/contact-smoke.json; echo
[ "$HTTP" = "200" ] && echo "OK: contact backend live" || { echo "FAIL: HTTP $HTTP"; exit 1; }
