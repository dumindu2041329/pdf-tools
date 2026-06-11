# POST /api/tools/watermark-pdf

Status: 504 (FUNCTION_INVOCATION_TIMEOUT)

## Request

Started: Jun 11 05:54:28.25 GMT+5:30

Request ID: n45nt-1781137468259-369a3832308a

Path: /api/tools/watermark-pdf

Host: pdf-tools-chi.vercel.app

User Agent: Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36

Referer: `https://pdf-tools-chi.vercel.app/tools/watermark-pdf` 

Search Params

- nxtPtool=watermark-pdf

Error: FUNCTION_INVOCATION_TIMEOUT

Received in Mumbai, India (bom1)

Firewall Allowed

### Middleware

200

Execution Duration / Maximum: 13ms / 5m

External APIs

No outgoing requests

### Fluid

269 MB

Routed to Washington, D.C., USA (iad1)

### Function Invocation

Route: / api / tools / [tool]

Execution Duration / Maximum: 1m / 1m

External APIs

| Method | Request |
| --- | --- |
| GET | [pdf-tools-blob](/dumindu2041329s-projects/~/stores/blob/store_AmdYaknUEiMsTvmJ) |
| GET | Button: api.clerk.com/v1/users/user_3Es6DbXsq8yGmCXv6NdQi9bYQe8 |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| POST | Button: api.c-2.ap-southeast-1.aws.neon.tech/sql |
| GET | Button: api.ilovepdf.com/v1/start/watermark |
| POST | Button: api39.ilovepdf.com/v1/upload |
| POST | Button: api39.ilovepdf.com/v1/process |

### Fluid

723 MB

Response finished in 1m

## Deployment Information

Deployment ID: dpl_FHGf2EgmXZwimab23pi2FSmrD4G3

Environment: production

Branch: master

Increase the timeout for vercel

------------------------------------------------------------------------

Let me check the current Vercel config and bump the timeout.
        
            
toolName: view_files
            
status: success
          
            
filePath: c:\Users\Dumindu\Documents\Next JS Projects\pdf-tools\vercel.json
          
**මේක Vercel plan limit එකක්** — ඔබේ `vercel.json` එකේ දැනටමත් `maxDuration: 120` set කරලා තියෙනවා ([vercel.json#L4](file:///c:/Users/Dumindu/Documents/Next%20JS%20Projects/pdf-tools/vercel.json#L4)), නමුත් actual limit එක **Vercel plan එක අනුව cap වෙනවා**:

| Plan | Max Function Duration |
|---|---|
| **Hobby (Free)** | **60 seconds** ← ඔබ දැන් මෙතන |
| Pro | 300 seconds (5 min) |
| Enterprise | 800 seconds |

ඔබේ project එක Hobby plan එකේ නිසා **60s hard cap** එක තියෙනවා, `vercel.json` එකේ මොනවා ලිව්වත් ignore කරනවා. Log එකේ "Execution Duration / Maximum: **1m / 1m**" කියන්නේ ඒකයි.

External API call timeline එක බැලුවම පේනවා 60s ඇතුලත ඉවර කරන්න අමාරු කියලා:
- 1× Vercel Blob download (~2-5s for 50MB)
- 1× Clerk user check (~300ms)
- 9× Neon DB queries (~2-4s)
- 1× iLoveAPI start (~500ms)
- 1× iLoveAPI upload 50MB (~10-20s)
- 1× iLoveAPI process (~10-20s)
- **Total: ~25-50s, function overhead එක්ක 60s ට පහළින් tight**

Process call එක තමයි අන්තිමට පටන් ගත්තේ — upload එක හරියට ඉවර වුණාට පස්සේ 50MB PDF එකක් process කරන්න iLoveAPI ව තත්පර 15+ ගත වෙනවා, ඒක 60s එකේ ඉඩ නැහැ.

**Solution options:**

### Option A — Vercel Pro plan එකට upgrade (recommended, ඉක්මනින්)
- Project → **Settings** → **Billing** → upgrade to Pro
- Max duration 5 minutes වෙනවා → 50MB, 4GB එකට ආවත් comfortable
- Cost: $20/member/month
- ඔබේ Stripe Premium එකත් $20/month නිසා cost doubling එකක් නැහැ ඔබ දැනටම ව්‍යාපාර වලට ගන්නවා නම්

### Option B — Async processing pattern (free plan එකේම රැඳී ගන්න)
`/api/webhooks/iloveapi` route එක දැනටම තියෙනවා (iLoveAPI webhooks handle කරනවා). ඒක use කරලා:
1. Client request එක job ID එකක් return කරනවා (< 5s response)
2. Background function එකක් iLoveAPI process call කරනවා
3. Process complete වෙනකොට webhook එකෙන් client එකට notify කරනවා
4. Client polling/web socket එකෙන් status check කරනවා

මේක significant refactor එකක් (~1-2 days work):
- `/api/tools/[tool]` route එක දෙකකට split කරන්න ඕන (start + status)
- Job queue (Vercel KV / Upstash Redis) එකක් add කරන්න ඕන
- Client UI එකේ polling/WebSocket add කරන්න ඕන
- iLoveAPI webhook එකට real job tracking logic add කරන්න ඕන

### Option C — Quick wins (Hobby plan එකේම ටිකක් ඉඩ ගන්න)
vercel.json එකට මොකක්ද කරන්න බැහැ, නමුත් code එක optimize කරලා seconds කිහිපයක් save කරන්න පුළුවන්:
- DB queries 9 → 2-3 ට reduce (`canProcessFile` එකේ separate counter read + plan check batch කරන්න)
- `getUserPlan` Clerk-only path එකට optimize (DB fallback එක early return කරන්න)
- Watermark tool එකට අවශ්‍ය image buffer copy එක avoid කරන්න

මේවා 5-10s save කරයි, 50MB වලට තාම 60s ඇතුලත ගැලපෙනවාද guarantee නැහැ, නමුත් smaller files වලට ලොකු වෙනසක් කරනවා.

**මගේ recommendation:** **Option A (Pro upgrade)** — ඔබේ SaaS එක 50MB+ ඉලක්ක කරනවා නම් (ඔබේ Premium 4GB එකට ඉඩ දෙනවා), 5 minute timeout එක **non-negotiable**. Free plan එකේ 60s cap එක නිසා premium user කෙනෙක් 1GB PDF එකක් upload කරත් fail වෙනවා — ඔබේ product එක broken වෙනවා.

ඔබ Pro upgrade කරන්න ඕන නම්, ඊට පස්සේ මම Option C එකේ optimization ටිකත් implement කරන්නද? නැත්නම් Option B async refactor එක ගැන discuss කරන්නද?