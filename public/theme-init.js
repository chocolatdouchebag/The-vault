(function () {
  try {
    var language = localStorage.getItem("fligaliga-language") || "en";
    var theme = localStorage.getItem("fligaliga-theme") || "dark";
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
