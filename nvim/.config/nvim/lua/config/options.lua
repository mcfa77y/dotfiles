-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- 2026-08-24: noice.nvim compiles the Vim highlights query for command-line
-- highlighting. Some installed Vim parsers do not expose the anonymous "tab"
-- token used by Neovim's bundled query, which raises an invalid-node error.
-- Keep the upstream query and drop only that optional keyword token.
do
  local query = vim.treesitter and vim.treesitter.query
  if query and query.get_files and query.set then
    local ok, files = pcall(query.get_files, "vim", "highlights")
    if ok and #files > 0 then
      local lines = {}
      local patched = false

      for _, file in ipairs(files) do
        for _, line in ipairs(vim.fn.readfile(file)) do
          if line:match('^%s*"tab"%s*$') then
            patched = true
          else
            lines[#lines + 1] = line
          end
        end
      end

      if patched then
        query.set("vim", "highlights", table.concat(lines, "\n"))
      end
    end
  end
end
