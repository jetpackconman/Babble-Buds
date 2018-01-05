const fs = require('fs-extra')
const remote = require('electron').remote
const dialog = remote.dialog
const main = remote.require('./main')
const settings = remote.require('./main-process/settings')
const menu = remote.require('./main-process/menus/application-menu')
const controller = require('./controller')
const editor = require('./editor')
const status = require('./status')
const semver = require('semver')

const path = require('path')

module.exports = {
    // project: {},
    // characters: {},
    // charactersPath: "",
    // assetsPath: "",
    // numCharacters: 0,
    // actor: {},
	readProject: function() {
		if (!this.checkChanges()) return

        let filepath = remote.getGlobal('project').filepath
		fs.readJson(filepath, (err, proj) => {
			if (err) {
				main.redirect('welcome.html')
				return
			}

			status.init()
			remote.getGlobal('project').project = this
			this.project = proj
			this.oldProject = JSON.stringify(proj)
			this.characters = {}
			this.assets = {}
			this.charactersPath = path.join(filepath, '..', 'characters')
			this.assetsPath = path.join(filepath, '..', 'assets')
			this.numCharacters = 0

			let compare = proj.clientVersion ? semver.compare(proj.clientVersion, remote.app.getVersion()) : -1
			if (compare !== 0) {
				let options = {
					"type": "question",
					"buttons": ["Cancel", "Open Anyways"],
					"defaultId": 0,
					"title": "Open Project?",
					"cancelId": 0
				}
				if (compare > 0) {
					options.message = "You are attempting to open a project made with a more recent version of Babble Buds."
					options.detail = "Caution is advised. Saving this project will downgrade it to this version of Babble Buds, and may cause problems or lose features."
				} else {
					options.message = "You are attempting to open a project made with a less recent version of Babble Buds."
					options.detail = "Opening this project will upgrade it to this version of Babble Buds."
				}

				let response = dialog.showMessageBox(options)
				switch (response) {
					default: 
						this.project.clientVersion = remote.app.getVersion();
						break
					case 0:
						main.redirect('welcome.html')
						return false
				}
			}

			for (let i = 0; i < proj.characters.length; i++) {
				let character = this.characters[proj.characters[i].id] = JSON.parse(this.getEmptyCharacter(true))
				Object.assign(character, fs.readJsonSync(path.join(this.charactersPath, proj.characters[i].location)))
				character.name = proj.characters[i].name
				character.id = proj.characters[i].id
				if (proj.characters[i].id > this.numCharacters)
					this.numCharacters = proj.characters[i].id
				if (Object.prototype.toString.call(character.emotes) === "[object Object]") {
					// Convert from object to array
					let arr = []
					let emotes = ['default', 'happy', 'wink', 'kiss', 'angry', 'sad', 'ponder', 'gasp', 'veryangry', 'verysad', 'confused', 'ooo']
					for (let i = 0; i < emotes.length; i++) {
						if (character.emotes[emotes[i]]) {
							let emote = character.emotes[emotes[i]]
							emote.name = emotes[i]
							arr.push(emote)
						} else {
							arr.push({
								enabled: false,
								mouth: [],
								eyes: [],
								name: emotes[i]
							})
						}
					}
					character.emotes = arr
					character.emote = emotes.indexOf(character.emote || "default")
					if (proj.actor.id === character.id) {
						proj.actor.emote = emotes.indexOf(character.emote || "default")
					}
					for (let i = 0; i < character.eyes.length; i++) {
						character.eyes[i] = emotes.indexOf(character.eyes[i] || "default")
					}
					for (let i = 0; i < character.mouths.length; i++) {
						character.mouths[i] = emotes.indexOf(character.mouths[i] || "default")
					}
				}
			}
			this.oldCharacters = JSON.stringify(this.characters)
			this.actor = proj.actor

			// Old version of assets
			if (proj.assets) {
				this.assets = {}
				let oldAssets = {}
				for (let i = 0; i < proj.assets.length; i++) {
					let assets = fs.readJsonSync(path.join(this.assetsPath, proj.assets[i].location))
					oldAssets[proj.assets[i].name] = {}
					let keys = Object.keys(assets)
					for (let j = 0; j < keys.length; j++) {
						assets[keys[j]].tab = proj.assets[i].name
						assets[keys[j]].version = 0
						assets[keys[j]].panning = []
						assets[keys[j]].location = assets[keys[j]].location.replace(/\\/g, '/')
						this.assets[settings.settings.uuid + ":" + settings.settings.numAssets] = assets[keys[j]]
						oldAssets[proj.assets[i].name][keys[j]] = settings.settings.numAssets
						settings.setNumAssets(settings.settings.numAssets + 1)
					}
				}

				// Update asset references in puppets
				let keys = Object.keys(this.characters)
				for (let i = 0; i < keys.length; i++) {
					let character = this.characters[keys[i]]
			    	let topLevel = ["body", "head", "hat", "props"]

			    	for (let j = 0; j < topLevel.length; j++)
				        for (let k = 0; k < character[topLevel[j]].length; k++) {
				        	character[topLevel[j]][k].id = settings.settings.uuid + ":" + oldAssets[character[topLevel[j]][k].tab][character[topLevel[j]][k].hash]
				        	delete character[topLevel[j]][k].tab
				        	delete character[topLevel[j]][k].hash
				        }

				    let emotes = Object.keys(character.emotes)
				    for (let j = 0; j < emotes.length; j++) {
				    	for (let k = 0; k < character.emotes[emotes[j]].eyes.length; k++) {
				    		character.emotes[emotes[j]].eyes[k].id = settings.settings.uuid + ":" + oldAssets[character.emotes[emotes[j]].eyes[k].tab][character.emotes[emotes[j]].eyes[k].hash]
				        	delete character.emotes[emotes[j]].eyes[k].tab
				        	delete character.emotes[emotes[j]].eyes[k].hash
				    	}
				    	for (let k = 0; k < character.emotes[emotes[j]].mouth.length; k++) {
				    		character.emotes[emotes[j]].mouth[k].id = settings.settings.uuid + ":" + oldAssets[character.emotes[emotes[j]].mouth[k].tab][character.emotes[emotes[j]].mouth[k].hash]
				        	delete character.emotes[emotes[j]].mouth[k].tab
				        	delete character.emotes[emotes[j]].mouth[k].hash
				    	}
				    }
				}
				delete this.project.assets
			} else {
				this.assets = fs.readJsonSync(path.join(this.assetsPath, "assets.json"))

				// Cross compatibility - windows will handle UNIX-style paths, but not vice versa
				let keys = Object.keys(this.assets)
				for (let i = 0; i < keys.length; i++) {
					let asset = this.assets[keys[i]]
					asset.location = asset.location.replace(/\\/g, '/')
					if (keys[i].split(":")[0] == settings.settings.uuid && parseInt(keys[i].split(":")[1]) >= settings.settings.numAssets)
						settings.setNumAssets(parseInt(keys[i].split(":")[1]) + 1)
					if (!asset.version) {
						asset.version =  0
						asset.panning = []
					}
				}
			}

			for (let i = 0; i < this.project.characters.length; i++) {
				fs.removeSync(path.join(this.assetsPath, '..', 'thumbnails', 'new-' + this.project.characters[i].id + '.png'))
				fs.removeSync(path.join(this.assetsPath, '..', 'thumbnails', 'new-' + this.project.characters[i].id))
			}

			settings.settings.openProject = filepath
			settings.save()
            controller.init()
			menu.updateMenu()
		})
	},
	saveProject: function() {
		fs.writeFile(settings.settings.openProject, JSON.stringify(this.project, null, 4))
		for (let i = 0; i < this.project.characters.length; i++) {
			fs.writeFile(path.join(settings.settings.openProject, '..', 'characters', this.project.characters[i].location), JSON.stringify(this.characters[this.project.characters[i].id], null, 4))
			if (fs.existsSync(path.join(this.assetsPath, '..', 'thumbnails', 'new-' + this.project.characters[i].id + '.png')))
                fs.renameSync(path.join(this.assetsPath, '..', 'thumbnails', 'new-' + this.project.characters[i].id + '.png'), 
                	path.join(this.assetsPath, '..', 'thumbnails', this.project.characters[i].id + '.png'))
            if (fs.existsSync(path.join(this.assetsPath, '..', 'thumbnails', 'new-' + this.project.characters[i].id))) {
            	if (fs.existsSync(path.join(this.assetsPath, '..', 'thumbnails', '' + this.project.characters[i].id)))
            		fs.removeSync(path.join(this.assetsPath, '..', 'thumbnails', '' + this.project.characters[i].id))
                fs.renameSync(path.join(this.assetsPath, '..', 'thumbnails', 'new-' + this.project.characters[i].id), 
                	path.join(this.assetsPath, '..', 'thumbnails', "" + this.project.characters[i].id))
            }
		}
		settings.addRecentProject(controller.getThumbnail())
		this.oldProject = JSON.stringify(this.project)
		this.oldCharacters = JSON.stringify(this.characters)
	},
	closeProject: function() {
		if (!this.checkChanges()) return

		this.project = null
		this.assets = null
		this.characters = null
		this.oldProject = 'null'
		this.oldCharacters = 'null'
		settings.settings.openProject = ""
		settings.save()
		editor.clear()
		menu.updateMenu()

		main.redirect('welcome.html')
	},
	// Returns true if its okay to close the project
	checkChanges: function() {
		if (!editor.checkChanges())
        	return false
		let changes = this.oldProject !== JSON.stringify(this.project)
		changes = changes || this.oldCharacters !== JSON.stringify(this.characters)
		if (changes) {
			let response = dialog.showMessageBox({
				"type": "question",
				"buttons": ["Don't Save", "Cancel", "Save"],
				"defaultId": 2,
				"title": "Save Project?",
				"message": "Do you want to save the changes to your project?",
				"detail": "If you don't save, your changes will be lost.",
				"cancelId": 1
			})

			switch (response) {
				default:
					break
				case 1:
					return false
				case 2:
					this.saveProject()
					break
			}
		}

		return true
	},
	getNewAssetId: function() {
		settings.setNumAssets(settings.settings.numAssets + 1)
		return settings.settings.numAssets
	},
	addAsset: function(id, asset) {
		this.assets[id] = asset
		fs.writeFile(path.join(settings.settings.openProject, '..', 'assets', 'assets.json'), JSON.stringify(this.assets, null, 4))
	},
    deleteAsset: function(id) {
        delete this.assets[id]
        fs.writeFile(path.join(settings.settings.openProject, '..', 'assets', 'assets.json'), JSON.stringify(this.assets, null, 4))
    },
    saveCharacter: function(character) {
        let char = null
        for (let i = 0; i < this.project.characters.length; i++) {
            if (this.project.characters[i].id == character.id) {
                char = this.project.characters[i]
                break
            }
        }
        if (char === null)
            this.project.characters.push({"name": character.name, "id": character.id, "location": character.id + '.json'})
        else
        	char.name = character.name
        this.characters[character.id] = character
    },
    duplicateCharacter: function(character) {
        this.numCharacters++
        let char = JSON.parse(JSON.stringify(character))
        char.id = this.numCharacters
        return JSON.stringify(char)
    },
    deleteCharacter: function(character) {
        for (let i = 0; i < this.project.characters.length; i++) {
            if (this.project.characters[i].id == character.id) {
                this.project.characters.splice(i, 1)
                delete this.characters[character.id]
                if (character.id == this.numCharacters) this.numCharacters--
                break
            }
        }
	},
    getEmptyCharacter: function(dontIncrement) {
        if (!dontIncrement) this.numCharacters++
        return JSON.stringify({
            "deadbonesStyle": false,
            "bundles": [],
            "body": [],
            "head": [],
            "hat": [],
            "mouths": [],
            "eyes": [],
            "emotes": [
		        {
		            "enabled": true,
		            "mouth": [],
		            "eyes": [],
		            "name": "default"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "happy"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "wink"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "kiss"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "angry"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "sad"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "ponder"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "gasp"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "veryangry"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "verysad"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "confused"
		        },
		        {
		            "enabled": false,
		            "mouth": [],
		            "eyes": [],
		            "name": "ooo"
		        }
		    ],
            "props": [],
            "name": "New Puppet",
            "id": this.numCharacters
        })
    },
    getPuppet: function() {
        let puppet = JSON.parse(JSON.stringify(this.characters[this.actor.id]))
        puppet.position = this.actor.position
        puppet.emote = this.actor.emote
        puppet.facingLeft = this.actor.facingLeft
        return puppet
    }
}
