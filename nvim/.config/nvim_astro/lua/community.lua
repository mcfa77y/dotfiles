-- AstroCommunity: import any community modules here
-- We import this file in `lazy_setup.lua` before the `plugins/` folder.
-- This guarantees that the specs are processed before any user plugins.

---@type LazySpec
return {
  "AstroNvim/astrocommunity",
  { import = "astrocommunity.pack.lua" },
  -- import/override with your plugins folder
  { import = "astrocommunity.colorscheme.catppuccin",    enabled = true },
  -- example of importing an entire language pack
  -- these packs can set up things such as Treesitter, Language Servers, additional language specific plugins, and more!
  { import = "astrocommunity.pack.python-ruff" },
  { import = "astrocommunity.pack.typescript" },
  { import = "astrocommunity.motion.mini-surround" },
  { import = "astrocommunity.motion.flash-nvim" },
  { import = "astrocommunity.diagnostics.trouble-nvim" },
  { import = "astrocommunity.session.vim-workspace" },
  { import = "astrocommunity.fuzzy-finder.snacks-picker" },
  { import = "astrocommunity.completion.codeium-nvim" },
}
