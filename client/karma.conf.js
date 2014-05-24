module.exports = function(config) {
  config.set({
    frameworks: ['jasmine'],
    browsers: ['PhantomJS'],
    reporters: ['progress', 'junit', 'coverage'],
    junitReporter: {
      outputFile: '../shippable/testresults/results.xml',
      suite: 'unit',
    },
    coverageReporter: {
      type: 'cobertura',
      dir: '../shippable/codecoverage/',
    },
    preprocessors: {
      'src/**/!(*.spec).js': ['coverage'],
    },
    files: [
      // bower:js
      'bower_components/jquery/dist/jquery.js',
      'bower_components/firebase/firebase.js',
      'bower_components/firebase-simple-login/firebase-simple-login.js',
      'bower_components/underscore/underscore.js',
      'bower_components/codemirror/lib/codemirror.js',
      'bower_components/codemirror/mode/css/css.js',
      'bower_components/codemirror/mode/javascript/javascript.js',
      'bower_components/codemirror/mode/xml/xml.js',
      'bower_components/codemirror/addon/lint/lint.js',
      'bower_components/codemirror/addon/lint/javascript-lint.js',
      'bower_components/codemirror/addon/edit/matchbrackets.js',
      'bower_components/codemirror/addon/edit/matchtags.js',
      'bower_components/codemirror/addon/display/placeholder.js',
      'bower_components/codemirror/addon/fold/xml-fold.js',
      'bower_components/jshint/dist/jshint.js',
      'bower_components/Recorderjs/recorder.js',
      'bower_components/angular/angular.js',
      'bower_components/altfire/src/altfire.js',
      'bower_components/jquery-ui/ui/jquery.ui.core.js',
      'bower_components/jquery-ui/ui/jquery.ui.widget.js',
      'bower_components/jquery-ui/ui/jquery.ui.position.js',
      'bower_components/jquery-ui/ui/jquery.ui.menu.js',
      'bower_components/jquery-ui/ui/jquery.ui.autocomplete.js',
      'bower_components/jquery-ui/ui/jquery.ui.tooltip.js',
      'bower_components/angular-ingredients/src/angular_ingredients.js',
      'bower_components/angular-ingredients/src/modal_dialog/modal.js',
      'bower_components/angular-ingredients/src/modal_dialog/modal_dialog.js',
      'bower_components/angular-cookies/angular-cookies.js',
      // endbower
      'bower_components/angular-mocks/angular-mocks.js',
      'src/**/*.js',
    ]
  });
};
