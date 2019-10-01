# microdb-api-nodejs-client
MicroDB.co officially supported Node.js client library for accessing MicroDB APIs

This module is the glue between the MicroDB API service and your application. 
It requires your secret API key to make calls to your database on MicroDB.
It autogenerates code that mirrors your database.


To Use:

// import into code...

  env('./envVars.txt');
  var microdb = require('../microdb')(process.env.MICRODB_DB_APIKEY);
  

// Then call a table defined in your database...this example assumes an account table is present

   microdb.Tables.account.get({ 'email': 'email@domain_name.com' }).then(function (res) {
      var response = {message:'',success:'',users:[]};      
      if (!res.success){
        response.message='error attempting to get by email';
        response.success = false;
      }
      else {
        response.users = res.data && res.data.Rows? res.data.Rows:[];
        response.success = true;
      }
      resolve(response);
    });
