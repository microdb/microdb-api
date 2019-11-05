# microdb-api-nodejs-client

MicroDB REST API wrapper for Node.js

https://www.microdb.co is data-as-a-service for serverless applications.

## Install
    npm install microdb 

## Set API key and output folder
    Create a envVars.txt file with these values. 
    - MICRODB_MYPASS_DB_APIKEY = your_db_apikey_from_microdb
    

## Usage
    var microdb = require('microdb')(process.env.MICRODB_MYPASS_DB_APIKEY);
  

  
    microdb.Tables.account.get({ 'email': 'email@domain_name.com' }).then(function (res) {
        var response = {message:'',success:'',users:[]};      
        if (res.success){
          response.users = res.data && res.data.Rows? res.data.Rows:[];
        }
      });
