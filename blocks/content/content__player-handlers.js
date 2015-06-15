(function () {
  'use strict';
  var SCROBBLE_PERCENTAGE = 50;
  var nowPlayingInterval = 15 * 1000;

  var utils = window.vkScrobbler.ContentUils;
  var Indicators = window.vkScrobbler.Indicators;
  var BusWrapper = window.vkScrobbler.ContentBusWrapper;

  function PlayerHandlers() {
    this.busWrapper = new BusWrapper();
    this.state = {
      enabled: true,
      playing: false,
      scrobbled: false,
      scrobbling: false,

      artist: null,
      track: null,

      nowPlayingSendTimeStamp: null,
      playTimeStamp: null, //timeStamp of previous "progress" call
      playedTime: 0
    };

    this.setUpIndicatorsListeners();
  }

  PlayerHandlers.prototype.progress = function (data) {
    console.log('playnow', this.state.artist, this.state.track)
    if (!this.state.playing) {
      return;
    }
    var timeDiff = Date.now() - (this.state.playTimeStamp || Date.now());
    this.state.playedTime += timeDiff / 1000;

    this.state.playTimeStamp = Date.now();
    this.sendNowPlayingIfNeeded();
    var playedPercent = this.state.playedTime / data.total * 100;
    this.scrobbleIfNeeded(playedPercent);
  };

  PlayerHandlers.prototype.pause = function () {
    console.log('pause', this.state.artist, this.state.track)
    this.state.playing = false;
    this.state.playTimeStamp = null;
    this.indicateScrobblerStatus();
  };

  PlayerHandlers.prototype.resume = function () {
    console.log('resume', this.state.artist, this.state.track)
    this.state.playing = true;
    this.indicateScrobblerStatus();
  };

  PlayerHandlers.prototype.stop = function () {
    console.log('stop', this.state.artist, this.state.track);
    this.state.playing = false;
    this.state.enabled && Indicators.indicateVKscrobbler();
  };

  PlayerHandlers.prototype.playStart = function (data) {
    console.log('start', data.artist, data.title);
    this.state.artist = data.artist;
    this.state.track = data.title;

    this.state.scrobbled = false;
    this.state.playing = true;
    this.state.playedTime = 0;
    this.state.playTimeStamp = Date.now();
    this.state.nowPlayingSendTimeStamp = null;

    this.state.enabled && Indicators.indicatePlayNow();
    Indicators.setTwitButtonHref(utils.getTwitLink(data.artist, data.title));
    this.checkTrackLove(data.artist, data.title);
  };

  PlayerHandlers.prototype.isNowPlayingIntervalPassed = function () {
    return Date.now() - this.state.nowPlayingSendTimeStamp > nowPlayingInterval;
  };

  PlayerHandlers.prototype.sendNowPlayingIfNeeded = function () {
    if (this.state.enabled && (!this.state.nowPlayingSendTimeStamp || this.isNowPlayingIntervalPassed())) {
      this.busWrapper.sendNowPlayingRequest(this.state.artist, this.state.track);
      this.state.nowPlayingSendTimeStamp = Date.now();
    }
  };

  PlayerHandlers.prototype.scrobbleIfNeeded = function (percent) {
    if (this.state.enabled &&
      !this.state.scrobbled &&
      !this.state.scrobbling &&
      percent > SCROBBLE_PERCENTAGE) {
      this.state.scrobbling = true;
      this.busWrapper.sendScrobleRequest(this.state.artist, this.state.track)
        .then(function () {
          this.state.scrobbling = false;
          this.state.scrobbled = true;
          Indicators.indicateScrobbled();
        }.bind(this), function onError() {
          this.state.scrobbling = false;
        }.bind(this));
    }
  };

  PlayerHandlers.prototype.isSameTrack = function (artist, track) {
    return this.state.artist === artist && this.state.track === track;
  };

  PlayerHandlers.prototype.checkTrackLove = function (artist, track) {
    Indicators.indicateNotLove();

    return this.busWrapper.getTrackInfoRequest(artist, track)
      .then(function (response) {
        var loved = response.track && response.track.userloved === '1';
        console.log(this.state, this.isSameTrack(artist, track))
        if (loved && this.isSameTrack(artist, track)) {
          Indicators.indicateLoved();
        }
      }.bind(this));
  };

  PlayerHandlers.prototype.indicateScrobblerStatus = function () {
    if (!this.state.enabled) {
      Indicators.indicatePauseScrobbling();
    } else if (this.state.scrobbled) {
      Indicators.indicateScrobbled();
    } else if (this.state.playing) {
      Indicators.indicatePlayNow();
    } else {
      Indicators.indicateVKscrobbler();
    }
  };

  PlayerHandlers.prototype.setUpIndicatorsListeners = function () {
    Indicators.setListeners({
      toggleLove: function (isLove) {
        if (!this.state.artist || !this.state.track) {
          return new Promise(function(resolve, reject) {reject();});
        }
        if (isLove) {
          return this.busWrapper.sendUnlove(this.state.artist, this.state.track).then(Indicators.indicateNotLove);
        } else {
          return this.busWrapper.sendNeedLove(this.state.artist, this.state.track).then(Indicators.indicateLoved);
        }
      }.bind(this),
      togglePauseScrobbling: function togglePauseScrobbling() {
        this.state.enabled = !this.state.enabled;
        this.indicateScrobblerStatus();
        this.busWrapper.sendPauseStatus(this.state.artist, this.state.track, !this.state.enabled);
      }.bind(this)
    });
  };

  window.vkScrobbler.PlayerHandlers = PlayerHandlers;
})();
