-- lua/plugins/trouble-filegroup.lua
return {
  "folke/trouble.nvim",
  opts = function(_, opts)
    ---@type trouble.Config
    opts = opts or {}
    opts.modes = opts.modes or {}
    for _, mode in ipairs({
      "definitions",
      "references",
      "implementations",
      "type_definitions",
      "declarations",
      "command",
    }) do
      local lsp_mode = "lsp_" .. mode
      opts.modes[lsp_mode] = vim.tbl_deep_extend("force", opts.modes[lsp_mode] or {}, {
        groups = {
          { "filename", format = "{file_icon} {basename} {filename} {count}" },
        },
      })
    end
    for _, mode in ipairs({ "incoming_calls", "outgoing_calls" }) do
      local lsp_mode = "lsp_" .. mode
      opts.modes[lsp_mode] = vim.tbl_deep_extend("force", opts.modes[lsp_mode] or {}, {
        groups = {
          { "filename", format = "{file_icon} {basename} {filename} {count}" },
        },
      })
    end
    return opts
  end,
}
