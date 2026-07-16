# User Input Notifications

- **Notify on Request for Input:** Whenever you ask the user a question, present options, request clarification, or require user input/feedback to proceed, you must run the `cmux notify` CLI command first to alert the user.
  - Example:
    ```bash
    cmux notify --title "Antigravity Needs Input" --body "Please check the terminal; I need your input to proceed."
    ```
