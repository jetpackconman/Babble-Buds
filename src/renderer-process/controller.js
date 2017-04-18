// Imports
const remote = require('electron').remote
const BrowserWindow = remote.BrowserWindow
const application = require('./application.js')
const editor = require('./editor.js')
const network = require('./network.js')
const status = require('./status.js')
const Stage = require('./stage.js').Stage
const project = remote.require('./main-process/project')
const path = require('path')
const url = require('url')

// Vars
var stage
var puppet
var hotbar = []
var popout

exports.init = function() {
	status.init()
	status.log('Loading project...')
	stage = new Stage('screen', project.project, project.assets, project.assetsPath, loadPuppets)
}

exports.setPuppetLocal = function(index) {
	if (!hotbar[index]) return

	// Set Puppet
	stage.setPuppet(puppet.id, hotbar[index])
	puppet = hotbar[index]

	// Update Editor
	application.setPuppet(index, puppet.emotes)

	// Update Project
	project.actor.id = project.project.hotbar[index]

	// Update Server
	network.emit('set puppet', puppet.id, project.getPuppet())

	// Update popout
	if (popout) popout.webContents.send('set puppet', puppet.id, project.project.hotbar[index])
}

exports.setEmoteLocal = function(emote) {
	// Change Emote
	exports.setEmote(puppet.id, emote)

	// Update Editor
	application.setEmote(puppet.emote)

	// Update Project
	project.actor.emote = emote

	// Update Server
	network.emit('set emote', puppet.id, emote)
}

exports.moveLeftLocal = function() {
	// Move Left
	exports.moveLeft(puppet.id)

	// Update Project
	project.actor.facingLeft = puppet.facingLeft
	project.actor.position = ((puppet.target % (project.project.numCharacters + 1)) + (project.project.numCharacters + 1)) % (project.project.numCharacters + 1)

	// Update Server
	network.emit('move left', puppet.id)
}

exports.moveRightLocal = function() {
	// Move Right
	exports.moveRight(puppet.id)

	// Update Project
	project.actor.facingLeft = puppet.facingLeft
	project.actor.position = puppet.target % (project.project.numCharacters + 1)

	// Update Server
	network.emit('move right', puppet.id)
}

exports.startBabblingLocal = function() {
	// Start Babbling
	exports.startBabbling(puppet.id)

	// Update Editor
	application.setBabble(true)

	// Update Server
	network.emit('start babbling', puppet.id)
}

exports.stopBabblingLocal = function() {
	// Stop Babbling
	exports.stopBabbling(puppet.id)

	// Update Editor
	application.setBabble(false)

	// Update Server
	network.emit('stop babbling', puppet.id)
}

exports.setPuppet = function(id, puppet) {
	// Set Puppet
	stage.setPuppet(id, stage.createPuppet(puppet))

	// Update popout
	if (popout) popout.webContents.send('set puppet', id, puppet)
}

exports.setEmote = function(id, emote) {
	// Change Emote
	stage.getPuppet(id).changeEmote(emote)

	// Update popout
	if (popout) popout.webContents.send('set emote', id, emote)
}

exports.moveLeft = function(id) {
	var puppet = stage.getPuppet(id)

	// Move Left
	puppet.moveLeft()

	// Update popout
	if (popout) popout.webContents.send('move left', id)

	return puppet
}

exports.moveRight = function(id) {
	var puppet = stage.getPuppet(id)

	// Move Right
	puppet.moveRight()

	// Update popout
	if (popout) popout.webContents.send('move right', id)

	return puppet
}

exports.startBabbling = function(id) {
	// Start Babbling
	stage.getPuppet(id).setBabbling(true)

	// Update popout
	if (popout) popout.webContents.send('start babbling', id)
}

exports.stopBabbling = function(id) {
	// Stop Babbling
	stage.getPuppet(id).setBabbling(false)

	// Update popout
	if (popout) popout.webContents.send('stop babbling', id)
}

exports.popIn = function() {
	popout.close()
}

exports.popOut = function() {
	if (project.project.transparent)
		popout = new BrowserWindow({frame: false, parent: remote.getCurrentWindow(), transparent: true})
	else
		popout = new BrowserWindow({frame: false, parent: remote.getCurrentWindow(), backgroundColor: project.project.greenScreen})
	// popout.setIgnoreMouseEvents(true)
	popout.on('close', () => {
		application.closePopout()
		stage.reattach('screen')
		popout = null
	})
	popout.loadURL(url.format({
		pathname: path.join(__dirname, '../popout.html'),
		protocol: 'file:',
		slashes: true
	  }))
	application.openPopout()
}

exports.emitPopout = function(...args) {
	if (popout) popout.webContents.send(...args)
}

exports.resize = function() {
	stage.resize()
	exports.emitPopout('resize')
}

exports.updateHotbar = function(i, puppet) {
	project.updateHotbar(i, parseInt(puppet))
	if (puppet === '') {
		hotbar[i] = null
	} else {
		hotbar[i] = stage.createPuppet(project.characters[puppet])
	}
}

exports.addAsset = function(tab, asset) {
	exports.addAssetLocal(tab, asset)
	network.emit('add asset', tab, asset)
}

exports.addAssetLocal = function(tab, asset) {
	if (!project.assets[tab])
		project.assets[tab] = {}
	project.assets[tab][asset] = {"location": path.join(tab, asset + '.png')}
	project.addAsset(tab, asset)
	stage.addAsset(tab, asset)
	editor.addAsset(tab, asset)
	exports.emitPopout('add asset', tab, asset)
}

exports.deleteCharacter = function(character) {
	var index = project.project.hotbar.indexOf(character.id)
	if (index > -1) {
		hotbar[index] = null
		project.updateHotbar(index, parseInt(''))
		application.deleteCharacter(index)
	}
	for (var i = 0; i < project.project.characters.length; i++) {
        if (project.project.characters[i].id == character.id) {
            project.project.characters.splice(i, 1)
            delete project.characters[character.id]
        }
    }
}

exports.updateCharacter = function(index, character) {
	hotbar[index] = stage.createPuppet(character)
}

exports.connect = function() {
    stage.clearPuppets()
	if (popout) popout.webContents.send('connect')
}

exports.disconnect = function() {
	stage.clearPuppets()
	puppet = stage.addPuppet(project.getPuppet(), 1)
	if (popout) popout.webContents.send('disconnect')
}

exports.host = function() {
	if (popout) {
		popout.webContents.send('connect')
		popout.webContents.send('assign puppet')
	}
}

exports.assign = function(id) {
	puppet = stage.addPuppet(project.getPuppet(), id)
	if (popout) popout.webContents.send('assign puppet', id)
}

exports.addPuppet = function(puppet) {
	stage.addPuppet(puppet, puppet.charId)
	if (popout) popout.webContents.send('add puppet', puppet)
}

exports.removePuppet = function(id) {
	stage.removePuppet(id)
	if (popout) popout.webContents.send('remove puppet', id)
}

function loadPuppets() {
	status.log('Loading puppets...', true)

	// Add Puppet
	puppet = stage.addPuppet(project.getPuppet(), 1)

	// Puppet Editor
	editor.init()
	stage.registerPuppetListener('mousedown', (e) => {
		editor.setPuppet(JSON.parse(project.duplicateCharacter(e.target.puppet)))
	})

	// Create Hotbar Puppets
	for (var i = 0; i < project.project.hotbar.length; i++) {
		if (project.project.hotbar[i] !== '' && project.project.hotbar[i] > 0)
			hotbar[i] = stage.createPuppet(project.characters[project.project.hotbar[i]])
	}

	// Update editor
	application.setPuppet(project.project.hotbar.indexOf(project.actor.id), puppet.emotes)
	application.setEmote(puppet.emote)

	status.log('Project Loaded!', false)
}
