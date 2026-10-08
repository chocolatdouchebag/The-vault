(function () {
  try {
    var savedLanguage = localStorage.getItem("fligaliga-language");
    var browserLanguage = (navigator.languages && navigator.languages.length ? navigator.languages[0] : navigator.language || "en").toLowerCase();
    var language = savedLanguage || (browserLanguage.indexOf("nl") === 0 ? "nl" : "en");
    var theme = localStorage.getItem("fligaliga-theme") || "light";
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.lang = "en";
    document.documentElement.dataset.theme = "light";
  }
})();
