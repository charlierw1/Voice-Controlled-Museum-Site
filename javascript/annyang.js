if (window.annyang) {
  window.annyang.removeCommands();
  window.annyang.setLanguage("en-US");
  window.annyang.addCommands({
    hello: () => alert("Hello!")
  });
  window.annyang.start({ autoRestart: true, continuous: false });
}