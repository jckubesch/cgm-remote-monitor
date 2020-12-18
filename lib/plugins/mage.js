'use strict';

var _ = require('lodash');
var moment = require('moment');
var levels = require('../levels');

function init(ctx) {
  var translate = ctx.language.translate;

  var mage = {
    name: 'mage'
    , label: 'Medtronic Reservoir Change'
    , pluginType: 'pill-minor'
  };

  mage.getPrefs = function getPrefs (sbx) {
    // MAGE_INFO = 44 MAGE_WARN=48 MAGE_URGENT=70
    return {
      info: sbx.extendedSettings.info || 44
      , warn: sbx.extendedSettings.warn || 48
      , urgent: sbx.extendedSettings.urgent || 72
      , display: sbx.extendedSettings.display ? sbx.extendedSettings.display : 'minutes'
      , enableAlerts: sbx.extendedSettings.enableAlerts || false
    };
  };

  mage.setProperties = function setProperties (sbx) {
    sbx.offerProperty('mage', function setProp ( ) {
      return mage.findLatestTimeChange(sbx);
    });
  };

  mage.checkNotifications = function checkNotifications (sbx) {
    var reservoirInfo = sbx.properties.mage;

    if (reservoirInfo.notification) {
      var notification = _.extend({}, reservoirInfo.notification, {
        plugin: mage
        , debug: {
          age: reservoirInfo.age
        }
      });
      sbx.notifications.requestNotify(notification);
    }
  };

  mage.findLatestTimeChange = function findLatestTimeChange (sbx) {

    var prefs = mage.getPrefs(sbx);

    var reservoirInfo = {
      found: false
      , age: 0
      , treatmentDate: null
      , checkForAlert: false
    };

    var prevDate = 0;

    _.each(sbx.data.longactingTreatments, function eachTreatment (treatment) {
      var treatmentDate = treatment.mills;
      if (treatmentDate > prevDate && treatmentDate <= sbx.time) {

        prevDate = treatmentDate;
        reservoirInfo.treatmentDate = treatmentDate;

        var a = moment(sbx.time);
        var b = moment(reservoirInfo.treatmentDate);
        var days = a.diff(b,'days');
        var hours = a.diff(b,'hours') - days * 24;
        var age = a.diff(b,'hours');

        if (!reservoirInfo.found || (age >= 0 && age < reservoirInfo.age)) {
          reservoirInfo.found = true;
          reservoirInfo.age = age;
          reservoirInfo.days = days;
          reservoirInfo.hours = hours;
          reservoirInfo.notes = treatment.notes;
          reservoirInfo.minFractions = a.diff(b,'minutes') - age * 60;
        }
      }
    });

    reservoirInfo.level = levels.NONE;

    var sound = 'incoming';
    var message;
    var sendNotification = false;

    if (reservoirInfo.age >= prefs.urgent) {
      sendNotification = reservoirInfo.age === prefs.urgent;
      message = translate('Medtronic reservoir change overdue!');
      sound = 'persistent';
      reservoirInfo.level = levels.URGENT;
    } else if (reservoirInfo.age >= prefs.warn) {
      sendNotification = reservoirInfo.age === prefs.warn;
      message = translate('Time to change Medtronic reservoir');
      reservoirInfo.level = levels.WARN;
    } else  if (reservoirInfo.age >= prefs.info) {
      sendNotification = reservoirInfo.age === prefs.info;
      message = 'Change Medtronic reservoir reservoir soon';
      reservoirInfo.level = levels.INFO;
    }

    if (prefs.display === 'days' && reservoirInfo.found) {
      reservoirInfo.display = '';
      if (reservoirInfo.age >= 24) {
        reservoirInfo.display += reservoirInfo.days + 'd';
      }
      reservoirInfo.display += reservoirInfo.hours + 'h';
    } else {
      reservoirInfo.display = reservoirInfo.found ? reservoirInfo.age + 'h' : 'n/a ';
    }

    //allow for 20 minute period after a full hour during which we'll alert the user
    if (prefs.enableAlerts && sendNotification && reservoirInfo.minFractions <= 20) {
      reservoirInfo.notification = {
        title: translate('Medtronic reservoir changed %1 hours ago', { params: [reservoirInfo.age] })
        , message: message
        , pushoverSound: sound
        , level: reservoirInfo.level
        , group: 'MAGE'
      };
    }

    return reservoirInfo;
  };

  mage.updateVisualisation = function updateVisualisation (sbx) {

    var reservoirInfo = sbx.properties.mage;

    var info = [{ label: translate('Change'), value: new Date(reservoirInfo.treatmentDate).toLocaleString() }];

    if (!_.isEmpty(reservoirInfo.notes)) {
      info.push({label: translate('Notes') + ':', value: reservoirInfo.notes});
    }

    var statusClass = null;
    if (reservoirInfo.level === levels.URGENT) {
      statusClass = 'urgent';
    } else if (reservoirInfo.level === levels.WARN) {
      statusClass = 'warn';
    }

    sbx.pluginBase.updatePillText(mage, {
      value: reservoirInfo.display
      , label: translate('MAGE')
      , info: info
      , pillClass: statusClass
    });
  };
  return mage;
}

module.exports = init;

