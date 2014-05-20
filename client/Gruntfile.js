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

  var compressedFiles = {
    assets: [
      'dist/fonts/fontawesome-webfont.ttf', 'dist/fonts/fontawesome-webfont.svg',
      'dist/fonts/FontAwesome.otf'
    ],
    css: ['dist/css/libs.css', 'dist/css/app.css'],
    js: ['dist/js/libs.js', 'dist/js/app.js'],
  };

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      all: {
        src: ['src/**/*.js'],
        jshintrc: true
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
          'angular-ingredients': {
            main: [
              'src/angular_ingredients.js', 'src/modal_dialog/modal.js',
              'src/modal_dialog/modal_dialog.js'
            ]
          },
          codemirror: {
            main: [
              'lib/codemirror.js', 'lib/codemirror.css',
              'mode/css/css.js', 'mode/javascript/javascript.js', 'mode/xml/xml.js',
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
        src: ['index.html', 'browserconfig.xml'],
        dest: 'dist',
      },
    },

    imagemin: {
      assets: {
        expand: true,
        src: ['*.png', 'favicons/**/*.{png,jpg,jpeg,gif}', 'images/**/*.{png,jpg,jpeg,gif}'],
        dest: 'dist'
      },
      jqueryUiImages: {
        expand: true,
        cwd: 'bower_components/jquery-ui/themes/ui-lightness',
        src: 'images/*',
        dest: 'dist/css',
      },
    },

    'file-creator': {
      generatedConfig: {
        files: {
          'src/generated_config.js': function(fs, fd, done) {
            if (!process.env.LEARNFUL_FIREBASE) {
              throw new Error('Missing environment variable LEARNFUL_FIREBASE');
            }
            fs.writeSync(
              fd, (
                "angular.module('learnful.generated_config', [])" +
                ".constant('generatedConfig', {firebase: '${LEARNFUL_FIREBASE}'});\n"
              ).replace('${LEARNFUL_FIREBASE}', process.env.LEARNFUL_FIREBASE));
            done();
          }
        }
      }
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

    lineending: {
      srcIndex: {
        files: {
          'index.html': ['index.html']
        }
      },
    },

    compress: {
      options: {
        mode: 'gzip',
        level: 9
      },
      assets: {
        expand: true,
        src: compressedFiles.assets,
      },
      css: {
        expand: true,
        src: compressedFiles.css,
      },
      js: {
        expand: true,
        src: compressedFiles.js,
      },
    },

    clean: {
      dist: ['dist', '.tmp'],
      assets: compressedFiles.assets,
      css: compressedFiles.css,
      js: compressedFiles.js,
    },

    replace: {
      css: {
        src: 'dist/css/**/*.css',
        overwrite: true,
        replacements: compressedFiles.assets.map(function(filename) {
          filename = filename.replace(/^dist\//, '');
          return {from: filename, to: filename + '.gz'};
        })
      },
      js: {
        src: 'dist/js/app.js',
        overwrite: true,
        replacements: [{
          from: '/bower_components/Recorderjs/',
          to: '/js/'
        }]
      },
      html: {
        src: 'dist/index.html',
        overwrite: true,
        replacements: compressedFiles.css.map(function(filename) {
          filename = filename.replace(/^dist\//, '');
          return {from: filename, to: filename + '.gz'};
        }).concat(compressedFiles.js.map(function(filename) {
          filename = filename.replace(/^dist\//, '');
          return {from: filename, to: filename + '.gz'};
        }))
      },
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
          src: ['dist/css/**/*.css.gz', 'dist/js/**/*.js.gz', '!dist/js/*.recorderWorker.js'],
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

  grunt.registerTask('dev', [
    'jshint', 'bowerInstall', 'file-creator', 'sails-linker', 'lineending:srcIndex'
  ]);
  grunt.registerTask('default', ['dev']);

  grunt.registerTask('dist', [
    'clean:dist', 'dev', 'copy', 'imagemin',
    'useminPrepare', 'ngtemplates', 'concat', 'ngAnnotate', 'uglify', 'cssmin',
    'compress:assets', 'clean:assets',
    'rev:assets',
    'replace:css', 'usemin:css', 'compress:css', 'clean:css',
    'replace:js', 'usemin:js', 'compress:js', 'clean:js',
    'rev:dependents',
    'replace:html', 'usemin:html', 'htmlmin',
  ]);
};
