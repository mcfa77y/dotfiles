-- Color picker
return {
  "uga-rosa/ccc.nvim",
  opts = {
    -- Your configuration goes here
    highlighter = {
      auto_enable = true,
      lsp = true,
      filetypes = { "typescript", "typescriptreact", "javascript", "javascriptreact", "css", "scss" },
    },
  },
  config = function(_, opts)
    require("ccc").setup(opts)
  end,
  -- Optional: Bind a key to open the color picker
  keys = {
    { "<leader>cO", "<cmd>CccPick<cr>", desc = "Color Picker" },
  },
}
