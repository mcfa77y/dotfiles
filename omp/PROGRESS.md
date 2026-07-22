# Oh My Pi (omp) Antigravity Provider Progress

## Current Status
4:- `omp` is successfully installed and working with the custom `google-antigravity` provider.
5:- We are using `gcloud` Application Default Credentials (ADC) for authentication.
6:- We have successfully set the quota project to `gen-lang-client-0131713846` via `gcloud auth application-default set-quota-project`.

## The gcloud Authentication Alternative
To bypass the restrictive `agy` Client ID limits and use heavier models, we attempted to switch to `gcloud` Application Default Credentials (ADC).
1. We successfully authenticated using `gcloud auth application-default login`.
2. However, the Cloud Code Assist API requires a quota project to bill the API usage against.
3. When trying to set `empo-health-antigravity` as the quota project, we hit a permission error: **Service Usage API is disabled**.
4. The user lacks the `serviceusage.services.enable` permission to enable the API on the `empo-health-antigravity` project.

We saved the `gcloud`-based authentication script to:
`/Users/joe/dotfiles/omp/scripts/omp-antigravity-auth-gcloud.ts`

## Next Steps for the Future
To unlock the heavier `pro` models in `omp`, you must do one of the following:

**Option A: Enable Service Usage API**
1. Ask a project owner of `empo-health-antigravity` to enable the Service Usage API:
   [https://console.developers.google.com/apis/api/serviceusage.googleapis.com/overview?project=empo-health-antigravity](https://console.developers.google.com/apis/api/serviceusage.googleapis.com/overview?project=empo-health-antigravity)
2. Run: `/Users/joe/Projects/git-apps/google-cloud-sdk/bin/gcloud auth application-default set-quota-project empo-health-antigravity`
3. Swap the scripts: `cp ~/dotfiles/omp/scripts/omp-antigravity-auth-gcloud.ts ~/dotfiles/omp/scripts/omp-antigravity-auth.ts`
4. Update `~/.omp/agent/config.yml` to use `gemini-2.5-pro` and `gemini-3-pro` for the `default`, `slow`, and `plan` model roles.

**Option B: Use a Different Quota Project**
If you have another GCP project where you are the owner (or the API is already enabled):
1. Run: `/Users/joe/Projects/git-apps/google-cloud-sdk/bin/gcloud auth application-default set-quota-project <YOUR_OTHER_PROJECT_ID>`
2. Follow steps 3 & 4 from Option A.
