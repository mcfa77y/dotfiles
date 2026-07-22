# Google Cloud Platform (GCP) API Justification: Developer Tooling Integration

This document provides a technical and operational justification for enabling the **Cloud Code Private API** and the **Service Usage API** on our GCP project (`empo-health-antigravity`). These APIs are required to support advanced AI-assisted coding and terminal productivity tooling (specifically `omp` - Oh My Pi) used by the development team.

---

## Executive Summary

To maximize developer productivity, our terminal-based AI coding assistant (`omp`) integrates with **Google Gemini Code Assist**. This integration operates under the developer's official corporate identity (`joe@empohealth.com`) to ensure complete security, auditability, and adherence to company policies.

To authenticate requests and track usage quotas correctly, the Google API Gateway requires the association of our development traffic with an active, designated GCP project. To allow this secure connection, we need to enable two specific, standard developer services in our GCP project:

1. **Cloud Code Private API (`cloudcode-pa.googleapis.com`)** — Powers the Gemini Code Assist backend models and completion streaming.
2. **Service Usage API (`serviceusage.googleapis.com`)** — Governs API activation, quota checks, and programmatic management within the project.

Enabling these services carries **zero additional license cost** for the project itself, respects all existing IAM security boundaries, and represents standard developer-enablement practices.

---

## Detailed API Justifications

### 1. Cloud Code Private API (`cloudcode-pa.googleapis.com`)
* **Role**: Serves as the secure endpoint for Gemini Code Assist developer services.
* **Technical Requirement**: When our local IDE/terminal coding assistant (`omp`) constructs prompt context and requests code generation, it communicates with the `v1internal` stream endpoints managed by this API.
* **Why it is necessary**: Even though the developer possesses a valid Google OAuth token via corporate sign-in, Google's gateway blocks requests unless the underlying service is activated in the user's active billing/quota project. Activating this service establishes the legitimate gateway route.

### 2. Service Usage API (`serviceusage.googleapis.com`)
* **Role**: Controls the discovery, activation, and quota/policy monitoring of APIs within a GCP project.
* **Technical Requirement**: When Google’s official authentication libraries (e.g., `google-auth-library` used by our token client) initialize a connection, they query the project's metadata to verify project health, billing eligibility, and active quotas.
* **Why it is necessary**: 
  - **Programmatic Management**: Allows standard command-line tools (`gcloud`) and developer scripts to inspect and manage service states.
  - **Policy Validation**: Allows the client auth libraries to securely confirm that our project (`empo-health-antigravity`) is authorized as the quota-attribution project (`x-goog-user-project`) for outgoing calls.

---

## Security, Cost, & Compliance Alignment

* **Identity & Access Management (IAM)**: Enabling these APIs does not alter any project access controls. Only users with explicit IAM permissions on the project can call these endpoints or view the billing.
* **No Hidden Costs**: Activating these services within GCP does not incur passive costs. Billing is tied solely to active usage tiers (which fall under standard developer seat allocations or free-tier usage structures depending on our organizational agreement with Google Workspace/GCP).
* **Corporate Auditing**: Attributing traffic to our own GCP project (`empo-health-antigravity`) is the **most secure and compliant** way to run developer tooling. It avoids relying on unverified third-party proxies, ensuring all network requests travel directly to Google and are fully auditable within our GCP console.

---

## Recommendation & Action Items

We recommend authorizing the enablement of these two APIs on the `empo-health-antigravity` project. This can be accomplished instantly by an administrator or owner of the project clicking the following secure links:

1. [Enable Service Usage API](https://console.developers.google.com/apis/api/serviceusage.googleapis.com/overview?project=empo-health-antigravity)
2. [Enable Cloud Code Private API](https://console.developers.google.com/apis/api/cloudcode-pa.googleapis.com/overview?project=empo-health-antigravity)
