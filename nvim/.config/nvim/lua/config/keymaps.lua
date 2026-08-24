-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

local map = vim.keymap.set

-- 2026-03-17 Fast terminal access
map("n", "<leader>t", function()
  Snacks.terminal()
end, { desc = "Terminal (cwd)" })

-- map jk to escape
map("i", "jk", "<ESC>", { silent = true })

-- 2026-03-17 Automatically restore session for the current directory
vim.api.nvim_create_autocmd("VimEnter", {
  group = vim.api.nvim_create_augroup("auto_restore_session", { clear = true }),
  callback = function()
    -- Only restore if opening nvim without arguments (like just typing 'nvim')
    if vim.fn.argc() == 0 and not vim.g.started_with_stdin then
      -- persistence.nvim is the LazyVim default for this
      require("persistence").load()

      -- This call is intercepted by Noice and shown via Snacks
      vim.notify("Session restored: " .. vim.fn.fnamemodify(vim.fn.getcwd(), ":~"), vim.log.levels.INFO, {
        title = "Persistence",
      })
    else
      -- Optional: log why it didn't restore (helpful for debugging)
      vim.notify("Auto-restore skipped (file argument detected)", vim.log.levels.WARN, {
        title = "Persistence",
        render = "minimal", -- Keeps it unobtrusive
      })
    end
  end,
  nested = true,
})

-- 2026-07-22 Grep only inside TypeScript files
local LazyVim = require("lazyvim.util")
map("n", "<leader>sx", function()
  LazyVim.pick("live_grep", {
    args = { "-g", "*.ts", "-g", "*.tsx" },
  })()
end, { desc = "Grep TS/TSX Files" })

-- 2026-08-12 Copy relative file path and line number
map({ "n", "x" }, "<leader>cP", function()
  local path = vim.fn.fnamemodify(vim.fn.expand("%"), ":.")
  local mode = vim.fn.mode()
  local l1, l2
  if mode == "n" then
    l1 = vim.fn.line(".")
    l2 = l1
  else
    local v_start = vim.fn.line("v")
    local v_end = vim.fn.line(".")
    l1 = math.min(v_start, v_end)
    l2 = math.max(v_start, v_end)
    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<Esc>", true, false, true), "nx", false)
  end
  local text
  if l1 == l2 then
    text = path .. ":" .. l1
  else
    text = path .. ":" .. l1 .. "-" .. l2
  end
  vim.fn.setreg("+", text)
  vim.notify("Copied relative path: " .. text)
end, { desc = "Copy relative file path" })

-- 2026-08-12 Convert string to template string (replace quotes with backticks via mini.surround)
local function convert_to_template_string()
  local keys = (package.loaded["mini.surround"] and require("mini.surround").config.mappings.replace) or "gsr"
  local line_before = vim.api.nvim_get_current_line()

  -- Try replacing covering double quotes
  vim.cmd("normal " .. keys .. '"`')
  if vim.api.nvim_get_current_line() ~= line_before then
    return
  end

  -- Try replacing next double quotes
  vim.cmd("normal " .. keys .. 'n"`')
  if vim.api.nvim_get_current_line() ~= line_before then
    return
  end

  -- Try replacing covering single quotes
  vim.cmd("normal " .. keys .. "'`")
  if vim.api.nvim_get_current_line() ~= line_before then
    return
  end

  -- Try replacing next single quotes
  vim.cmd("normal " .. keys .. "n'`")
end

map("n", "<leader>ct", convert_to_template_string, { desc = "Convert string to template string" })
