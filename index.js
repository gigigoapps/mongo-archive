#!/usr/bin/env node

'use strict'

let Debug = require('debug')
Debug.enable('mongoarchive:*')

let checkConfig = require('./bin/config').checkConfig
let postInstall = require('./bin/config').postInstall
let archive = require('./bin/archive')
let mongoDB = require('./bin/db')
let childProcess = require('child_process')
let debug = Debug('mongoarchive:index')
let utils = require('./bin/utils')
let processControl = require('./bin/processControl')

let lockFile = '/tmp/mongoarchive.lock'


let argv = require('yargs')
    .version()
	.usage('Usage: mongoarchive [option]')

    .help('help')
    
    .describe('verbose', 'Enables verbose mode (extended log)')
    
    .describe('config', 'Post install process')
    .describe('start', 'Start mongoarchive (pm2)')
    .describe('stop', 'Stop mongoarchive (pm2)')
    .describe('delete', 'Delete mongoarchive (pm2)')
    .describe('run', false)
    .argv


let interval
if(argv.run && checkConfig()) {
    // process control
    if(processControl.isRunning(lockFile)) {
        debug('already-running')
        return 
    }
    processControl.setRunningLockFile(lockFile)

    let run = () => {
        if(!processControl.isRunning(archive.lockFile)) {
            debug('init')
            
            archive.run()
            .then( () => {
                mongoDB.closeConnection()
                debug('finish', 'Done')
            })
            .catch((err) => {
                mongoDB.closeConnection()
                processControl.removeRunningLockFile(archive.lockFile)
                debug('global-error', err)
            })

        }
    }

    //first run
    run()
    
    //run after X seconds
    interval = setInterval(() => { 
        run()   
    }, 60 * 60 * 1000)  //1 hour

} else if(argv.start && checkConfig()) {
    if(!processControl.isRunning(lockFile)) {
        debug('starting', 'starting with pm2')
        childProcess.execSync('pm2 start mongoarchive --kill-timeout 300000 -- --run')
    } else {
        console.log('Process already running')
    }

} else if(argv.stop) {
    if(processControl.isRunning(lockFile)) {
        debug('stopping', 'stopping in pm2')
        
        //not restart
        clearInterval(interval)
        
        // stop current process
        childProcess.execSync('pm2 stop mongoarchive')
        processControl.removeRunningLockFile(lockFile)
        processControl.removeRunningLockFile(archive.lockFile)
    } else {
        console.log('Process already stopped')
    }

} else if(argv.delete) {
    debug('deleting', 'deleting in pm2')
    
    if(processControl.isRunning(lockFile)) {
        //not restart
        clearInterval(interval)
    }

    processControl.removeRunningLockFile(lockFile)
    processControl.removeRunningLockFile(archive.lockFile)
    childProcess.execSync('pm2 delete mongoarchive')    

} else if(argv.config) {
    postInstall()
}


/**
 * Clean stop handler
 */
process.on('SIGINT', function () {
    debug('SIGINT')
    if (processControl.isRunning(archive.lockFile)) {
        debug('stoping-clean','waiting to clean stop')
        utils.setHasToStop()
    } else {
        process.exit(100)
    }
})