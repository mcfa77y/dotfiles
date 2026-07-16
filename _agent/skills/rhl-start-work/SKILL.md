---
name: rhl-start-work
description: Start work on an existing RHL Linear ticket — fetches ticket context, creates the git worktree branch via `wt switch --create`, runs lifecycle hooks, and surfaces title/description.
---

# Start Work on Existing RHL Ticket

Use this skill to pick up an existing Linear ticket and set up the worktree.

## Steps

1. **Confirm the ticket ID**: Ask the user for the Linear ticket ID (e.g. `RHL-3822`) if not provided.
2. **Fetch ticket context**: Use `mcp__linear_get_issue` with the identifier to fetch the title, description, and state.
3. **Create the worktree**: Lower-case the ticket ID (e.g. `rhl-3822`) and run:
   ```bash
   wt switch --create --config $GIT_TOOL_JS_DIR/.config/wt.toml <lowercase-ticket-id>
   ```
   *(Fallback if `$GIT_TOOL_JS_DIR` is unset: use `~/Projects/js_for_fun/git-tools-js/.config/wt.toml`)*
4. **Determine worktree path**:
   ```bash
   git worktree list | grep <lowercase-ticket-id> | awk '{print $1}'
   ```
5. **Switch directory**: Change `Cwd` to the resolved worktree path.
6. **Surface context**: Print the ticket title and description so implementation can begin.

## Linear IDs

Use these `empo-health` Linear IDs (from `agent/skills/linear.config.json`) when making MCP calls or resolving entities.

```json
{
  "team": {
    "name": "Remote Health Link",
    "key": "RHL",
    "id": "4670d896-c578-43a1-b8cf-50043d74d669"
  },
  "project": {
    "key": "qa",
    "name": "QA Project",
    "id": "c8f35a99-2b16-41a9-ae0f-48e32dbd4237",
    "url": "https://linear.app/empo-health/project/qa-project-a7fcf152916c"
  },
  "statuses": {
    "duplicate": "e5f9f7b7-043f-4598-a4ca-531ca0053c69",
    "inreview": "cfbdf80e-c7d2-41e2-ba56-cfd16ccee9f0",
    "needsdiscussion": "bbc94858-d9c1-4cf6-9efe-782222c53631",
    "done": "b33188ff-0eab-4cb9-960e-50fe01e9e644",
    "backlog": "a422f65f-ce64-4574-895f-3fa67ea657df",
    "todo": "9ba6b061-258a-489f-9572-2230c6e9d299",
    "canceled": "93df34d4-5a50-42fb-a259-491ac4e9aa75",
    "inProgress": "783efcac-f56e-4732-ba56-45f68ded7961",
    "waitingonexternalparty": "7702523a-845d-45a9-841b-2b65ba241dc2",
    "intesting": "22c614c9-647e-4f17-a293-9e30d6687618",
    "triage": "e2bf0f0c-ada6-466e-bdbe-2919c362b229"
  },
  "labels": {
    "phase-2": "616e415e-dfa1-4831-a97e-f92692ef2da6",
    "phase-3": "db125a17-5903-460d-9dea-f33b4060e559",
    "phase-1": "ca9ed66f-9b62-4d84-86ec-4e77ff2c7d2d",
    "DCAF": "f8a4a597-acfd-4457-89c0-dde6dba793f4",
    "EngOpsTestMfg": "baa8cfcc-63c0-422c-9e2e-777cfc377b28",
    "Basic R&D": "5706ba16-e4c2-4d77-96b5-6466957fde6d",
    "QMS": "60d8b09d-e6ee-419f-847d-fb7f3d5ba60f",
    "SEC": "604ed9d0-3e3b-42b3-ba41-f677081d6a71",
    "DRATA": "3488d46c-6317-468a-a490-000d20651e64",
    "Automated test failure": "8f07b65f-3d07-40b7-907f-0ed9968837fe",
    "Pre-release bug": "24ec772d-3c46-4dac-b21b-9a3deec86190",
    "Bug": "3c3f2687-5712-4590-aca7-85bd8800c578",
    "Released Bug": "a99c479e-d8b5-4d54-a979-53e891f50551",
    "HOT": "f3d21f07-1107-4a1c-a14d-a0cfc3dca2e8",
    "Carilion": "d8bea98e-c98d-4802-a8b7-3be5946c884c",
    "QA": "76b16628-e22e-4a85-8044-a035a3e39d9b",
    "test": "19ea09d6-a49e-4835-8e2c-0861a27dc507",
    "UI/UX": "7857397e-16d6-42ee-a4df-57204a3612ba"
  },
  "users": {
    "jofay": {
      "id": "512094cc-a373-49d8-a856-9537903f372e",
      "email": "jofay@empohealth.com"
    },
    "julian": {
      "id": "0e78d088-dbd7-494b-ad2f-a54416a12abe",
      "email": "julian@empohealth.com"
    },
    "taylor": {
      "id": "51fb66b7-b6c8-418d-86a9-1798932caacd",
      "email": "taylor.andonian@empohealth.com"
    },
    "giovanny": {
      "id": "dab35f8e-6417-446a-8f88-85dbd513d278",
      "email": "giovanny@empohealth.com"
    },
    "cynthia": {
      "id": "7d91dd1f-7f58-4233-b67d-d8b79600a262",
      "email": "cynthia@empohealth.com"
    },
    "ryan": {
      "id": "88bd1fc6-3c07-46df-8520-76647db81ecb",
      "email": "ryan@empohealth.com"
    },
    "hosam": {
      "id": "fb6621db-c783-4f01-a218-7f04ecd20082",
      "email": "hosam@empohealth.com"
    },
    "rishi": {
      "id": "ef5781c3-74a9-4c79-b78b-a96192cca4fb",
      "email": "rishi@empohealth.com"
    },
    "john@empohealth.com": {
      "id": "650811a6-8035-4273-9ef9-f3f61c128bef",
      "email": "john@empohealth.com"
    },
    "giovanny.farajallah@edendata.com": {
      "id": "2b540a84-4b9c-4b1c-8ddf-68bb6ecfdd48",
      "email": "giovanny.farajallah@edendata.com"
    },
    "madhurima": {
      "id": "ed7dfe00-a623-4f2f-9d4e-062364543d10",
      "email": "madhurima@empohealth.com"
    },
    "amy@empohealth.com": {
      "id": "272ba557-f098-4868-bea8-9765692b19b0",
      "email": "amy@empohealth.com"
    },
    "joanna": {
      "id": "535e48e4-0fcc-426b-bc5f-c16838a43900",
      "email": "joanna@empohealth.com"
    },
    "anshika": {
      "id": "9501db7b-203b-4f81-a60f-cccfe9cddb9b",
      "email": "anshika@empohealth.com"
    },
    "emily@empohealth.com": {
      "id": "afeb2c4b-7853-4d29-aec0-7edab67c8992",
      "email": "emily@empohealth.com"
    },
    "navleen@empohealth.com": {
      "id": "79c14891-6804-40ff-bf18-828cc77b72c7",
      "email": "navleen@empohealth.com"
    },
    "pedro": {
      "id": "aeb16e54-2ac0-4680-8cea-f3a88c2ce8c5",
      "email": "pedro@empohealth.com"
    },
    "joe": {
      "id": "fad7aa89-be83-4fd3-bce8-7e9d577a16e1",
      "email": "joe@empohealth.com"
    },
    "nevran@empohealth.com": {
      "id": "20995e65-ae7c-4bf6-8cd9-0ecbc58b23a9",
      "email": "nevran@empohealth.com"
    },
    "art": {
      "id": "c21414a7-69e4-4c8a-a630-bf3625a870e5",
      "email": "art@empohealth.com"
    },
    "joshua": {
      "id": "fa62d3ca-cb35-4947-ac6a-c95a858d2548",
      "email": "josh@empohealth.com"
    },
    "todd": {
      "id": "c1fee4de-ac0e-447b-a956-a199ebf8059e",
      "email": "todd@empohealth.com"
    },
    "sebastian": {
      "id": "f4d5c700-bcfd-42c8-bac1-25d7656c40ab",
      "email": "sebastian@siana-systems.com"
    },
    "simon": {
      "id": "855631bc-2568-45f8-b257-73ae34e1f321",
      "email": "simon.chen@57blocks.com"
    },
    "bill": {
      "id": "5e9fe2e2-8972-4e5b-b2bb-133000e8afbe",
      "email": "bill@empohealth.com"
    },
    "tyler": {
      "id": "8c1c0a15-b494-4e63-a2e7-2a5bba813d15",
      "email": "tyler@empohealth.com"
    },
    "quincy": {
      "id": "303eee36-f411-47b4-9554-b3c395487ed1",
      "email": "quincy@empohealth.com"
    },
    "anne": {
      "id": "c0ed87c0-aed5-429b-800e-c0d1cc7cee32",
      "email": "anne@empohealth.com"
    },
    "anuj": {
      "id": "14843288-273c-4b03-9f64-6be97071435c",
      "email": "anuj@empohealth.com"
    },
    "eric": {
      "id": "d3d1001e-e7e2-4b29-9073-b2ddcd57a831",
      "email": "eric@empohealth.com"
    }
  }
}
```
