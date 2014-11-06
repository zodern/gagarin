var MongoClient = require('mongodb').MongoClient;
var Promise = require('es6-promise').Promise;
var mkdirp = require('mkdirp');
var spawn = require('child_process').spawn;
var path = require('path');
var tools = require('./tools');
var either = tools.either;
var debounce = require('debounce');
var fs = require('fs');

var mongoServerPromise = null;

module.exports = {

  MongoServerAsPromise: function (options) {

    // TODO: we only want to start one mongo server per app,
    //       but theoretically there may be multiple apps
    if (mongoServerPromise) {
      return Promise.resolve(mongoServerPromise);
    }

    var port = 27018 + Math.floor(Math.random() * 1000);
    
    var mongoPath = options.mongoPath || tools.getMongoPath(options.pathToApp);
    var dbPath = options.dbPath || tools.getPathToDB(options.pathToApp);
    var mongoUrl = 'mongodb://127.0.0.1:' + port;
    var pathToGitIgnore = tools.getPathToGitIgnore(options.pathToApp);

    if (!fs.existsSync(mongoPath)) {
      return Promise.reject(new Error('file ' + mongoPath + ' does not exists'));
    }

    mongoServerPromise = new Promise(function (resolve, reject) {
      var configure = dbPath ? new Promise(function (resolve, reject) {
        mkdirp(dbPath, either(reject).or(resolve));
        // TODO: this requires more thinking
        //if (!fs.existsSync(pathToGitIgnore)) {
        //  fs.writeFileSync(pathToGitIgnore, 'local');
        //}
      }) : Promise.resolve('');
      //--------------------------
      configure.then(function () {
        var mongod;
        var args = [ '--port', port, '--smallfiles', '--nojournal', '--noprealloc' ];
        // --------------------------------------------------------------------------
        dbPath && args.push('--dbpath', path.resolve(dbPath));
        mongod = spawn(mongoPath || 'mongod', args);
        mongod.port = port;
        // use debounce to give the process some time in case it exits prematurely
        mongod.stdout.on('data', debounce(function (data) {
          //process.stdout.write(data);
          resolve(mongoUrl);
        }, 100));
        // on premature exit, reject the promise
        mongod.on('exit', function (code) {
          code && reject(new Error("mongo eixted with code: " + code));
        });
        // make sure mongod is killed as well if the parent process exits
        process.on('exit', function () {
          mongod.kill();
        });
      }, reject);
    });

    return mongoServerPromise;
  },

  connectToDB: function (mongoServerPromise, dbName) {
    return mongoServerPromise.then(function (mongoUrl) {
      return new Promise(function (resolve, reject) {
        MongoClient.connect(mongoUrl + '/' + dbName, either(reject).or(function (db) {
          resolve(db);
        }));
      });
    });
  },

};
