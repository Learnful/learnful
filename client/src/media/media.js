angular.module('learnful.media', ['altfire', 'ingredients', 'learnful', 'learnful.user'])

.controller('lfResponseEditor', function($scope, $q, $timeout, fire, modal, user, config) {
  'use strict';
  _.extend($scope, modal.getActiveModalData());
  $scope.user = user;

  var handles = fire.connect($scope, {
    frame: {pull: 'drafts/{{frameKey}}'},
    settings: {bind: 'users/{{user.currentUserKey}}/settings'}
  });
  handles.frame.ready().then(function() {
    $scope.response = angular.copy($scope.getResponse());
  });

  $scope.recording = {audio: false, video: false};
  var audioContext = new AudioContext();
  var audioRecorder, audioStream;

  function getMediaSources() {
    MediaStreamTrack.getSources(function(sourceInfos) {
      $scope.$apply(function() {
        $scope.sourceInfos = {audio: [], video: []};
        _.each(sourceInfos, function(sourceInfo) {
          if (!(sourceInfo.kind in $scope.sourceInfos)) return;
          sourceInfo = {
            id: sourceInfo.id, kind: sourceInfo.kind, label: sourceInfo.label || (
              sourceInfo.kind + ' ' + ($scope.sourceInfos[sourceInfo.kind].length + 1))
          };
          $scope.sourceInfos[sourceInfo.kind].push(sourceInfo);
        });
      });
    });
  }

  getMediaSources();

  $scope.isEditable = function() {
    return $scope.response && $scope.response.authorKey === user.currentUserKey;
  };
  $scope.getTidbit = function() {
    return $scope.frame.tidbits[$scope.tidbitKey];
  };
  $scope.getResponse = function() {
    var tidbit = $scope.getTidbit();
    return tidbit ? tidbit.responses[$scope.responseKey] : {};
  };

  $scope.recordAudio = function() {
    if ($scope.recording.audio) {
      stopRecordingAudio(audioStream);
    } else {
      navigator.getUserMedia(
        {audio: {optional: [{sourceId: $scope.settings.audioSourceId}]}}, startRecordingAudio,
        function(error) {alert('Unable to start recording: ' + error.name);}
      );
    }
  };

  function startRecordingAudio(stream) {
    getMediaSources();  // get again after we got media permission to fetch correct labels
    audioStream = stream;
    var source = audioContext.createMediaStreamSource(stream);
    // source.connect(audioContext.destination);
    audioRecorder = new Recorder(source, config.audioRecorder);
    $scope.$apply(function() {
      $scope.recording.audio = true;
      audioRecorder.record();
    });
  }

  function stopRecordingAudio() {
    if (audioRecorder) {
      audioRecorder.stop();
      audioRecorder.exportWAV(handleWav);
    }
    if (audioStream) {
      audioStream.stop();
      audioStream = null;
    }
  }

  function handleWav(blob) {
    $scope.$apply(function() {
      $scope.response.audio = {
        duration: (blob.size - 32) / 4 / audioRecorder.context.sampleRate,
        src: URL.createObjectURL(blob),
        blob: blob
      };
      audioRecorder.destroy();
      audioRecorder = null;
      $scope.recording.audio = false;
    });
  }

  function uploadMedia(media, filename) {
    if (!(media && media.blob)) return $q.when(null);
    var url = config.s3Media + config.firebase + '/' +
      [$scope.frameKey, $scope.tidbitKey, $scope.responseKey, filename].join('/');
    var deferred = $q.defer();
    var xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', function(event) {
      $timeout(function() {
        deferred.notify(event);
      });
    });
    xhr.addEventListener('load', function(event) {
      $timeout(function() {
        deferred.notify(event);
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          delete media.blob;
          media.src = url;
          deferred.resolve();
        } else {
          deferred.reject('' + xhr.status + ' ' + xhr.statusText);
        }
      });
    });
    xhr.addEventListener('error', function(event) {
      $timeout(function() {
        deferred.reject(xhr.statusText);
      });
    });
    xhr.addEventListener('abort', function(event) {
      $timeout(function() {
        deferred.reject('User canceled upload.');
      });
    });
    xhr.open('PUT', url);
    xhr.setRequestHeader('Cache-Control', 'public; max-age=3600');
    xhr.send(media.blob);
    return deferred.promise;
  }

  $scope.save = function() {
    $scope.mediaUploadProgress = {total: null, loaded: null};
    var latestProgressEvents = [];
    var promises = [uploadMedia($scope.response.audio, 'audio.wav')];
    _.each(promises, function(promise, index) {
      promise.then(null, null, function(event) {
        if (!$scope.mediaUploadProgress) return;
        latestProgressEvents[index] = event;
        $scope.mediaUploadProgress = {
          total: _.reduce(latestProgressEvents, function(sum, ev) {return sum + ev.total;}, 0),
          loaded: _.reduce(latestProgressEvents, function(sum, ev) {return sum + ev.loaded;}, 0)
        };
      });
    });
    $q.all(promises).then(function() {
      handles.frame.ref('tidbits', $scope.tidbitKey, 'responses', $scope.responseKey).update(
        $scope.response);
      modal.confirm();
    }, function(error) {
      alert('Upload failed: ' + error);
    }).finally(function() {
      $scope.mediaUploadProgress = null;
    });
  };
  $scope.cancel = function() {
    modal.cancel();
  };
})

.factory('director', function() {
  'use strict';
  var self = {};

  var currentPlayer;
  var autoplayToken;

  function handlePlay(event) {
    if (currentPlayer) currentPlayer.pause();
    currentPlayer = event.target;
  }

  function handleStop(event) {
    if (event.target === currentPlayer) currentPlayer = null;
  }

  self.register = function(mediaElement, token) {
    mediaElement.on('playing', handlePlay);
    mediaElement.on('pause ended', handleStop);
    mediaElement.attr('preload', 'auto');
    if (token && token === autoplayToken) {
      autoplayToken = null;
      mediaElement.on('canplay', function(event) {
        event.target.play();
      });
    }
  };

  self.autoplayNext = function(token) {
    autoplayToken = token;
  };

  self.isPlaying = function() {
    return !!currentPlayer;
  };

  return self;
})

.directive('lfDirectorMedia', function(director) {
  'use strict';
  return function($scope, element, attrs, controller) {
    director.register(element, attrs.lfDirectorMedia);
  };
})

;
