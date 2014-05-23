angular.module('learnful.components', [
])

.directive('lfCodeEditor', function($timeout) {
  'use strict';
  return {
    require: '?ngModel',
    scope: {model: '=ngModel'},
    link: function($scope, element, attrs, ngModel) {
      if (!$scope.model && element.text().trim()) {
        $scope.model = element.text().trim();
        if ($scope.model.indexOf('\n') !== -1) $scope.model += '\n';
      }
      element.html('');

      var options = {mode: attrs.mode};
      if (attrs.placeholder) options.placeholder = attrs.placeholder;
      if (attrs.mode === 'javascript-expression')  {
        _.extend(options, {
          mode: 'javascript',
          lineWrapping: true
        });
      } else if (attrs.mode === 'javascript') {
        _.extend(options, {
          matchBrackets: true,
          lint: true,
          lineNumbers: true,
          gutters: ['CodeMirror-lint-markers'],
          fixedGutter: false  // TODO: arena overview scaling (?) breaks fixed gutters
        });
      } else if (attrs.mode === 'htmlmixed') {
        _.extend(options, {
          matchTags: true,  // TODO: doesn't work?
          lineWrapping: true
        });
      } else if (!attrs.mode) {
        options.lineWrapping = true;
        element.addClass('proportional-font');
      }
      var codeMirror = new CodeMirror(element.get()[0], options);

      attrs.$observe('disabled', function(value) {
        codeMirror.setOption('readOnly', value ? 'nocursor': false);
      });

      if (!ngModel) return;

      ngModel.$render = function() {
        $timeout(function() {codeMirror.setValue(ngModel.$viewValue || '');});
      };

      codeMirror.on('change', function() {
        $scope.$apply(function() {
          ngModel.$setViewValue(codeMirror.getValue());
        });
      });
    }
  };
})

.directive('lfAutocomplete', function($timeout) {
  'use strict';
  return function($scope, element, attrs, controller) {
    element.autocomplete({
      source: function(request, response) {
        $scope[attrs.lfAutocomplete](request.term, response);
      },
      position: attrs.acPosition ? $scope.$eval(attrs.acPosition) : undefined,
      select: function(event, ui) {
        $scope.$apply(function() {
          if ($scope.$emit('ac-select', ui.item).defaultPrevented) {
            event.preventDefault();
          }
        });
      },
      focus: function(event, ui) {
        $scope.$apply(function() {
          if ($scope.$emit('ac-focus', ui.item).defaultPrevented) {
            event.preventDefault();
          }
        });
      }
    });
  };
})

.filter('duration', function() {
  'use strict';
  return function(input) {
    if (!input) return null;
    var secs = Math.round(input % 60);
    var mins = Math.floor(input / 60);
    return (mins ? '' + mins + 'm' : '') + secs + 's';
  };
})

.filter('wordCount', function() {
  'use strict';
  return function(input) {
    if (!input) return null;
    return input.trim().split(/\s+/).length;
  };
})

;
