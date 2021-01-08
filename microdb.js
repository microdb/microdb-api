'use strict';
var
  util = require("util"),
  eventEmitter = require('events').EventEmitter,
  env = require('node-env-file'),
  request = require('request'),
  fs = require('fs')
  ;

var Singleton = (function (apikey, opts) {
  env('./envVars.txt');

  var instance;

  function Microdb(apikey, opts) {
    opts = opts || {};
    var env = opts.env || process.env;
    if (!apikey) {
      throw 'API_KEY is required';
    }

    var app_instance = this;
    var VERSION = '1.0.0';
    var _API_KEY = apikey;
    var handlers = {
      onLoaded: null
    };
    var _DbId;
    var mdbevents = {
      initfailed: 'mdb.initfailed',
      init: 'mdb.init'
    };

    this.describeTables = describeTables;
    this.getTables=getTables;
    this.Events = mdbevents;
    this.Init = false;
    this.Tables = {};

    function init() {
      loadTables().then(function (gtRes) {
        if (!gtRes.success) {
          app_instance.emit(mdbevents.InitFailed);
        }
        else {
          app_instance.Init = true;
          app_instance.emit(mdbevents.init);
        }
      });
    }

    function loadTables() {
      return postMsg('tables/describe', {}).then(genSchema);
    }

    function getTables(){
      return loadTables().then(describeTables);
     }

    function describeTables() {
        return new Promise(function(resolve) {
        var tables = [];
        var keys = Object.keys(app_instance.Tables);
        for (var index = 0; index < keys.length; index++) {
          var tblname = keys[index];
          var element = app_instance.Tables[tblname];
          tables.push(
            {
              name: element.Name,
              columns: element.ColumnHeaders
            });
        }
        resolve(tables);
      });

    }

    function postMsg(route, msg) {

      if (!_API_KEY) {
        throw 'API_KEY is required';
      }
      return new Promise(function(resolve) {
        var clientResponse = new Response();
        var url = 'https://api.microdb.co:443/' + route;

        var reqOptions = {
          preambleCRLF: true,
          postambleCRLF: true,
          url: url
        };

        prepForm(reqOptions, msg, _API_KEY);
        request.post(reqOptions, serverResponse);

        function serverResponse(err, httpRes, apiResponse) {
          if (err) {
            clientResponse.success = false;
            resolve(clientResponse);
            return;
          }

          if (httpRes.statusCode === 200) {
            var resObj = JSON.parse(apiResponse);
            clientResponse.message = resObj.message;
            clientResponse.success = resObj.success;
            clientResponse.data = resObj.data;
          }
          else {
            clientResponse.httpcode = httpRes.statusCode;
            clientResponse.success = false;

          }
          resolve(clientResponse);
        }
      });
    }

    function prepForm(reqOptions, msg, _API_KEY) {
      var formData;

      var ismultipart = reqOptions.url.includes('/insert') || reqOptions.url.includes('/update');

      if (ismultipart && msg.data && msg.data.length > 0 && msg.data[0].constructor.name == 'TableRow') {

        formData = { payload: msg };
        var keys = Object.keys(formData.payload.data[0]);
        var prop;
        for (var di = 0; di < keys.length; di++) {
          prop = keys[di];
          if (formData.payload.data[0][prop].File) {
            var ff = formData.payload.data[0][prop].File;
            // formData.payload.data[0][prop] = { Value: '', FileMap: ff.fileInfo.filename, IsFile: '1' };
            var sss = formData.payload.data[0][prop];
            formData[ff.fileInfo.filename] = {
              'value': fs.createReadStream(ff.fileInfo.path),
              'options': {
                'filename': ff.fileInfo.filename,
                'contentType': ff.fileInfo.mimetype
              }
            };
            delete formData.payload.data[0][prop].File;
          }
        }
      }

      if (formData) {
        formData.payload = JSON.stringify(formData.payload);
        formData.apiKey = _API_KEY;
        formData.isjson = '1';
        reqOptions.formData = formData;

      }
      else {
        reqOptions.form = {
          'payload': msg,
          'apiKey': _API_KEY
        };
      }

    }

    function genSchema(res) {
      return new Promise(function(resolve) {
        if (!res.success) {
          resolve(res);
          return;
        }
        if (res.data.Tables) {
          app_instance.Tables={};
          res.data.Tables.forEach(function(element) {
            var tblName = scrubTableName(element.Name);
            Object.defineProperty(app_instance.Tables, tblName, {
              value: new Table(element),
              enumerable: true,
              configurable: false
            });
          });
        }

        resolve(res);
        return;
      });
    }

    function scrubTableName(name) {
      return name.toLowerCase().replace(/[^a-zA-Z0-9]/gi, ''); //removes all non-alphanumeric
    }

    function Table(tbl_schema) {
      var __schema = tbl_schema;
      var __table = this;

      this.Id = __schema.Id;
      this.Name = scrubTableName(__schema.Name);
      this.Imported = __schema.Imported;
      this.ColumnHeaders = [];
      this.add = saveNew;
      this.update = saveUpdate;
      this.delete = saveDelete;
      this.get = getTableData;
      this.getAttachment = getAttachment;
      this.getEmptyRow = getEmptyRow;

      __schema.Columns.forEach(function (col) {
        __table.ColumnHeaders.push(new ColumnHeader(col));
      });

      function getEmptyRow() {
        var row = new TableRow(__schema.Columns);
        return row;
      }

      function prepRequest(data,useBatchId) {
        if(!data){
          return data;
        }

        if (!Array.isArray(data)) {
          data = [data];
        }
        var req = new Request(__table.Id);
        for (var index = 0; index < data.length; index++) {
          var element = data[index];
          var row = getEmptyRow();
          row = maprows(row, element);
          if(useBatchId){
            row.batchid = index + 1;
          }
          req.data.push(row);
        }
        return req;
      }

      function saveNew(data) {
        var req = prepRequest(data,true);
        return postMsg('data/insert', req);
      }

      function saveUpdate(data) {
        var req = prepRequest(data,true);
        return postMsg('data/update', req);
      }

      function saveDelete(data) {
        var req = prepRequest(data);
        return postMsg('data/delete', req);
      }

      function maprows(row, data) {
        var rowkeys = Object.keys(row);
        var datakeys = Object.keys(data);

        //only use the columns given by client
        for (var rk = 0; rk < rowkeys.length; rk++) {
          var col = rowkeys[rk];
          if (!data.hasOwnProperty(rowkeys[rk])) {
              delete row[rowkeys[rk]];
          }
        }

        for (var i = 0; i < datakeys.length; i++) {
          var col2 = datakeys[i];
          if (row.hasOwnProperty(col2)) {
            if (data[col2] instanceof Microdb.prototype.File) {
              row[col2].File = data[col2];
              row[col2].FileMap = {
                filename: data[col2].fileInfo.filename,
                originalname: data[col2].fileInfo.originalname,
                fieldname: data[col2].fileInfo.fieldname
              };
            }
            else {
              row[col2].Value = data[col2];
            }

          }
        }
        if (data.primarykey && data.primarykey > 0) {
          row.primarykey.Value = data.primarykey;
        }
        return row;
      }

      function getTableData(data) {
        var req;
        if(data){
          req = prepRequest(data);
        }
        else{
         req = new Request(__table.Id);
        }
        return postMsg('data/get', req);
      }

      function getAttachment(data) {
        if(!data){
          return new Promise(function(resolve,reject) {reject();});
        }
        var req = prepRequest(data);
        return postMsg('attachment/get', req);
      }

    }


    function TableRow(columns) {
      var thisrow = this;
      columns.forEach(function (col) {
        var name = col.Label.toLowerCase().replace(/[\s]/gi, '_');
        Object.defineProperty(thisrow, name, {
          value: new Column(col),
          enumerable: true,
          configurable: true,
          writable: true
        });
      });
      return this;
    }

    function ColumnHeader(col) {
      var __col = col;

      this.Name = col.Label;
      this.FormattedName = col.Label.toLowerCase().replace(/[\s]/gi, '_');
      this.Value = col.Value || '';
      this.DataType = col.DataType;
      this.DisplayOrder = col.DisplayOrder;
      this.Id = col.Id;
      this.Length = col.Length;
      this.NotNull = col.NotNull;
      this.VirtualTypeId = col.VirtualTypeId;

      return this;
    }

    function Column(col) {
      var thisCol = this;
      var __col = col;
      this.Value = col.Value || '';
      return this;
    }

    function Request(tblid, data) {
      this.DbId = _DbId;
      this.TblId = tblid || 0;

      if (data && !Array.isArray(data)) {
        this.data = [data];
      }
      else {
        this.data = [];
      }
    }

    function Response(response) {
      this.success= '';
      this.error= '';
      this.message = '';
      this.data = '';

      if (response) {
        this.success = response.success;
        this.error = response.error;
      }
    }

    init();
  }

  Microdb.prototype.File = function (info) {
    this.fileInfo = info;
  };

  util.inherits(Microdb, eventEmitter);


  function createInstance(apikey, opts) {
    var object = new Microdb(apikey, opts);
    return object;
  }

  return {
    getInstance: function (apikey, opts) {
      if (!instance) {
        instance = createInstance(apikey, opts);
      }
      return instance;
    }
  };
})();

module.exports = Singleton;
