module.exports = function(grunt) {

  require('load-grunt-tasks')(grunt);

  var htmlminOptions = {
    collapseBooleanAttributes:      true,
    collapseWhitespace:             true,
    removeAttributeQuotes:          true,
    removeComments:                 true,
    removeEmptyAttributes:          true,
    removeRedundantAttributes:      true,
    removeScriptTypeAttributes:     true,
    removeStyleLinkTypeAttributes:  true
  };

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      all: {
        src: ['src/**/*.js'],
        jshintrc: true
      }
    },

    clean: {
      all: ['dist', '.tmp']
    },

    subgrunt: {
      angular: {
        'bower_components/angular-latest': 'minify'
      }
    },

    bowerInstall: {
      all: {
        src: ['index.html'],
        exclude: [/jquery\.js/],
        overrides: {
          jshint: {
            main: 'dist/jshint.js'
          },
          Recorderjs: {
            main: 'recorder.js'
          },
          codemirror: {
            main: [
              'lib/codemirror.js', 'lib/codemirror.css',
              'mode/css/css.js', 'mode/javascript/javascript.js', 'mode/python/python.js',
              'mode/xml/xml.js',
              'addon/lint/lint.js', 'addon/lint/javascript-lint.js', 'addon/lint/lint.css',
              'addon/edit/matchbrackets.js', 'addon/edit/matchtags.js',
              'addon/display/placeholder.js', 'addon/fold/xml-fold.js'
            ]
          },
          'jquery-ui': {
            main: [
              'ui/jquery.ui.core.js', 'ui/jquery.ui.widget.js', 'ui/jquery.ui.position.js',
              'ui/jquery.ui.menu.js', 'ui/jquery.ui.autocomplete.js', 'ui/jquery.ui.tooltip.js',
              'themes/ui-lightness/jquery-ui.css', 'themes/ui-lightness/jquery.ui.theme.css',
            ]
          },
        }
      }
    },

    copy: {
      fontAwesome: {
        expand: true,
        cwd: 'bower_components/fontawesome',
        src: 'fonts/*',
        dest: 'dist'
      },
      assets: {
        expand: true,
        src: ['index.html', '*.png', 'browserconfig.xml', 'favicons/**', 'images/**'],
        dest: 'dist',
      },
      jqueryUiImages: {
        expand: true,
        cwd: 'bower_components/jquery-ui/themes/ui-lightness',
        src: 'images/*',
        dest: 'dist/css',
      },
    },

    uglify: {
      recorderWorker: {
        files: {
          'dist/js/recorderWorker.js': ['bower_components/Recorderjs/recorderWorker.js']
        },
        options: {
          mangle: {toplevel: true},
        }
      },
    },

    replace: {
      recorderWorker: {
        src: 'dist/js/app.js',
        overwrite: true,
        replacements: [{
          from: '/bower_components/Recorderjs/',
          to: '/js/'
        }]
      }
    },

    useminPrepare: {
      html: 'index.html',
      options: {
        dest: 'dist'
      }
    },

    usemin: {
      html: 'dist/index.html',
      css: 'dist/css/*.css',
      js: 'dist/js/*.js',
      options: {
        assetsDirs: ['dist', 'dist/fonts', 'dist/images', 'dist/css', 'dist/js'],
        patterns: {
          js: [
            [/(images\/.*?\.(?:gif|jpeg|jpg|png|webp|svg))/gm, 'Update the JS to reference our revved images'],
            [/(\/js\/.*\.js)/gm, 'Update the JS to reference our revved aux JS files']
          ],
          css: [
            [ /(?:src=|url\(\s*)['"]?([^'"\)\?#]+)['"]?\s*\)?/gm, 'Update the CSS to reference our revved images']
          ]
        }
      }
    },

    rev: {
      assets: {
        files: [{
          src: ['dist/css/images/**', 'dist/fonts/**', 'dist/images/**', 'dist/js/recorderWorker.js'],
          filter: 'isFile'
        }]
      },
      dependents: {
        files: [{
          src: ['dist/css/**/*.css', 'dist/js/**/*.js', '!dist/js/*.recorderWorker.js'],
        }]
      }
    },

    ngAnnotate: {
      options: {
        singleQuotes: true
      },
      all: {
        files: {
          '.tmp/concat/js/app.js': ['.tmp/concat/js/app.js']
        }
      }
    },

    'sails-linker': {
      js: {
        options: {
          startTag: '<!-- link:js -->',
          endTag: '<!-- endlink -->',
        },
        files: {
          'index.html': ['src/**/*.js']
        }
      },
      css: {
        options: {
          startTag: '<!-- link:css -->',
          endTag: '<!-- endlink -->',
          fileTmpl: '<link rel="stylesheet" href="%s"/>'
        },
        files: {
          'index.html': ['src/**/*.css']
        }
      }
    },

    ngtemplates: {
      app: {
        src: 'partials/*.html',
        dest: '.tmp/ngtemplates/templates.js',
        options: {
          module: 'learnful',
          usemin: 'js/app.js',
          htmlmin: htmlminOptions
        }
      }
    },

    htmlmin: {
      all: {
        options: htmlminOptions,
        files: {
          'dist/index.html': ['dist/index.html'],
        }
      }
    }
  });

  grunt.registerTask('default', [
    'clean', 'jshint', 'bowerInstall', 'copy', 'sails-linker', 'useminPrepare', 'ngtemplates',
    'concat', 'ngAnnotate', 'uglify', 'cssmin', 'rev:assets', 'replace', 'usemin:css', 'usemin:js',
    'rev:dependents', 'usemin:html', 'htmlmin',
  ]);
};
