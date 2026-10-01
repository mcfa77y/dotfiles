return {
  "vuki656/package-info.nvim",
  event = { "BufReadPre package.json", "BufNewFile package.json" },
  cmd = {
    "PackageInfoShow",
    "PackageInfoShowForce",
    "PackageInfoHide",
    "PackageInfoToggle",
    "PackageInfoUpdate",
    "PackageInfoDelete",
    "PackageInfoInstall",
    "PackageInfoChangeVersion",
  },
  dependencies = { "MunifTanjim/nui.nvim" },
  opts = {
    autostart = true,
  },
  config = function(_, opts)
    require("package-info").setup(opts)
    if vim.fn.expand("%:t") == "package.json" and opts.autostart ~= false then
      vim.schedule(function()
        if vim.fn.expand("%:t") == "package.json" then
          require("package-info").show()
        end
      end)
    end
  end,
  keys = {
    { "<leader>cp", desc = "+package-info", ft = "json" },
    { "<leader>cpt", function() require("package-info").toggle() end, desc = "Toggle package info", ft = "json" },
    { "<leader>cpu", function() require("package-info").update() end, desc = "Update package on line", ft = "json" },
    { "<leader>cpd", function() require("package-info").delete() end, desc = "Delete package on line", ft = "json" },
    { "<leader>cpi", function() require("package-info").install() end, desc = "Install new package", ft = "json" },
    { "<leader>cpc", function() require("package-info").change_version() end, desc = "Change package version", ft = "json" },
    { "<leader>cps", function() require("package-info").show() end, desc = "Show package info", ft = "json" },
    { "<leader>cph", function() require("package-info").hide() end, desc = "Hide package info", ft = "json" },
    { "<leader>nt", function() require("package-info").toggle() end, desc = "Toggle package info", ft = "json" },
    { "<leader>nu", function() require("package-info").update() end, desc = "Update package on line", ft = "json" },
    { "<leader>nd", function() require("package-info").delete() end, desc = "Delete package on line", ft = "json" },
    { "<leader>ni", function() require("package-info").install() end, desc = "Install new package", ft = "json" },
    { "<leader>nc", function() require("package-info").change_version() end, desc = "Change package version", ft = "json" },
    { "<leader>ns", function() require("package-info").show() end, desc = "Show package info", ft = "json" },
  },
}
