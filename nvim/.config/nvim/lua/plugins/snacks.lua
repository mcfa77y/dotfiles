return {
  "folke/snacks.nvim",
  opts = {
    picker = {
      hidden = true, -- show hidden files/dotfiles across pickers
      sources = {
        explorer = {
          hidden = true,
          ignored = false,
          exclude = { "node_modules", ".git" },
        },
        files = {
          hidden = true,
          ignored = false,
          exclude = { "node_modules", ".git" },
        },
      },
    },
  },
}
