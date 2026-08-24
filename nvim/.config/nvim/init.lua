-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")

-- 2026-05-29
-- configure shfmt for zsh files
vim.filetype.add({
  extension = {
    zsh = "sh",
    zshrc = "sh",
  },
})
