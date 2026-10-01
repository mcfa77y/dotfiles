return {
  {
    "mason-org/mason.nvim",
    opts = function(_, opts)
      opts.ensure_installed = opts.ensure_installed or {}
      vim.list_extend(opts.ensure_installed, { "sonarlint-language-server" })
    end,
  },
  {
    "iamkarasik/sonarqube.nvim",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = { "mason-org/mason.nvim" },
    opts = function()
      local mason_path = vim.fn.stdpath("data") .. "/mason/packages/sonarlint-language-server/extension"

      return {
        lsp = {
          cmd = {
            vim.fn.exepath("java"),
            "-jar",
            mason_path .. "/server/sonarlint-ls.jar",
            "-stdio",
            "-analyzers",
            mason_path .. "/analyzers/sonarjs.jar",
            mason_path .. "/analyzers/sonarpython.jar",
            mason_path .. "/analyzers/sonarhtml.jar",
            mason_path .. "/analyzers/sonariac.jar",
            mason_path .. "/analyzers/sonartext.jar",
            mason_path .. "/analyzers/sonarxml.jar",
          },
        },
        javascript = {
          enabled = true,
          clientNodePath = vim.fn.exepath("node"),
        },
        python = {
          enabled = true,
        },
      }
    end,
  },
}
