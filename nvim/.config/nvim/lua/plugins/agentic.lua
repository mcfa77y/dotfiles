return {
  "carlos-algms/agentic.nvim",
  event = "VeryLazy",
  opts = {
    -- Default provider
    provider = "devin-acp",

    acp_providers = {
      ["devin-acp"] = {
        name = "Devin",
        command = "/Users/joe/.local/bin/devin",
        args = { "acp" },
      },
      ["omp-acp"] = {
        name = "Oh My Pi",
        command = "/opt/homebrew/bin/omp",
        args = { "acp" },
      },
      ["empo-ai"] = {
        name = "Empo AI",
        command = "/opt/homebrew/bin/omp",
        args = {
          "--config",
          (os.getenv("OMP_CONFIG_DIR") or (os.getenv("HOME") .. "/.omp/agent")) .. "/config.yml.empo-ai",
          "acp",
        },
      },
    },
  },
  keys = {
    {
      "<C-\\>",
      function()
        require("agentic").toggle()
      end,
      desc = "Agentic Toggle Chat",
      mode = { "n", "v", "i" },
    },
    {
      "<C-'>",
      function()
        require("agentic").add_selection_or_file_to_context()
      end,
      desc = "Agentic Add Context",
      mode = { "n", "v" },
    },
  },
}
