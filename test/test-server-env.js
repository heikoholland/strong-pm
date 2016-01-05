process.env.STRONGLOOP_LICENSE = 'inherited';

var Server = require('../lib/server');
var mktmpdir = require('mktmpdir');
var fs = require('fs');
var path = require('path');
var test = require('tap').test;
var _ = require('lodash');

function matchInstanceEnv(tt, env, expectedEnv) {
  // PORT is generated by service manager
  // STRONGLOOP_LICENSE is specifically inherited from PM environment
  tt.assert(env.PORT, 'PORT is set');
  tt.equal(env.STRONGLOOP_LICENSE, 'inherited',
           'STRONGLOOP_LICENSE is inherited from PM environment');
  tt.equal(env.STRONGLOOP_TRACES_ID, '1', 'STRONGLOOP_TRACES_ID set by PM');
  var appEnv = _.omit(env, 'PORT', 'STRONGLOOP_LICENSE',
                      'STRONGLOOP_TRACES_ID');
  tt.deepEqual(appEnv, expectedEnv, 'generated instance environment matches');
}

function matchEnv(tt, env, expectedEnv) {
  tt.deepEqual(env, expectedEnv, 'base environmnet should match');
}

test('service environment', function(t) {
  function MockDriver(o) {
    this.options = o;
  }
  MockDriver.prototype.getName = _.constant('Mock');
  MockDriver.prototype.on = function() {};
  MockDriver.prototype.setStartOptions = function() {};
  MockDriver.prototype.stop = function(callback) {
    callback();
  };

  t.test('empty initial environment', function(tt) {
    mktmpdir(function(err, tmpdir, cleanup) {
      tt.ifError(err);
      tt.on('end', cleanup);
      fs.writeFileSync(path.join(tmpdir, 'env.json'), '{}');

      var s = new Server({
        cmdName: 'pm',
        baseDir: tmpdir,
        listenPort: 0,
        Driver: MockDriver,
      });
      var Service = s._meshApp.models.ServerService;
      s._serviceManager.initOrUpdateDb(s._meshApp, function(err) {
        tt.ifError(err);
        tt.deepEqual(s.getDefaultEnv(), {});
        MockDriver.prototype.updateInstanceEnv =
          function(instanceId, env, callback) {
            matchInstanceEnv(tt, env, {});
            callback();
          };
        Service.create({name: 'Service 1'}, function(err, service) {
          tt.ifError(err);
          matchEnv(tt, service.env, {});

          // give some time for minkelite to initialize completely before
          // calling shutdown
          setTimeout(function() {
            s.stop(tt.end.bind(tt));
          }, 1000);
        });
      });
    });
  });

  t.test('initial environment', function(tt) {
    mktmpdir(function(err, tmpdir, cleanup) {
      tt.ifError(err);
      tt.on('end', cleanup);
      var defEnv = {FOO: 'foo', BAR: 'bar'};
      var newEnv = {BAR: 'bar'};
      fs.writeFileSync(path.join(tmpdir, 'env.json'), JSON.stringify(defEnv));

      var s = new Server({
        cmdName: 'pm',
        baseDir: tmpdir,
        listenPort: 0,
        Driver: MockDriver,
      });
      var Service = s._meshApp.models.ServerService;
      s._serviceManager.initOrUpdateDb(s._meshApp, function(err) {
        tt.ifError(err);
        tt.deepEqual(s.getDefaultEnv(), defEnv);
        MockDriver.prototype.updateInstanceEnv =
          function(instanceId, env, callback) {
            matchInstanceEnv(tt, env, defEnv);
            callback();
          };
        Service.create({name: 'Service 1'}, function(err, service) {
          tt.ifError(err);
          matchEnv(tt, service.env, defEnv);
          setImmediate(updateEnv.bind(null, service));
        });
      });

      function updateEnv(service) {
        MockDriver.prototype.updateInstanceEnv =
          function(instanceId, env, callback) {
            matchInstanceEnv(tt, env, newEnv);
            callback();
          };
        service.env = JSON.parse(JSON.stringify(newEnv));
        service.save(function(err) {
          tt.ifError(err);

          // give some time for minkelite to initialize completely before
          // calling shutdown
          setTimeout(function() {
            s.stop(tt.end.bind(tt));
          }, 1000);
        });
      }
    });
  });

  t.end();
});
