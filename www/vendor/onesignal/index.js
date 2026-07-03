import { registerPlugin } from "../../vendor/capacitor-core/index.js";
//#region src/DebugNamespace.ts
const LogLevel = {
	None: 0,
	Fatal: 1,
	Error: 2,
	Warn: 3,
	Info: 4,
	Debug: 5,
	Verbose: 6
};
var Debug = class {
	constructor(plugin) {
		this._plugin = plugin;
	}
	/**
	* Enable logging to help debug if you run into an issue setting up OneSignal.
	* @param  {LogLevel} logLevel - Sets the logging level to print to the Android LogCat log or Xcode log.
	* @returns void
	*/
	setLogLevel(logLevel) {
		this._plugin.setLogLevel({ logLevel });
	}
	/**
	* Enable logging to help debug if you run into an issue setting up OneSignal.
	* @param  {LogLevel} visualLogLevel - Sets the logging level to show as alert dialogs.
	* @returns void
	*/
	setAlertLevel(visualLogLevel) {
		this._plugin.setAlertLevel({ logLevel: visualLogLevel });
	}
};
//#endregion
//#region src/helpers.ts
/**
* Removes a listener from an array of listeners.
* @param array The array of listeners
* @param listener The listener to remove
*/
function removeListener(array, listener) {
	const index = array.indexOf(listener);
	if (index !== -1) array.splice(index, 1);
}
/**
* Returns true if the value is a JSON-serializable object.
*/
function isObjectSerializable(value) {
	if (!(typeof value === "object" && value !== null && !Array.isArray(value))) return false;
	try {
		JSON.stringify(value);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/InAppMessagesNamespace.ts
var InAppMessages = class {
	constructor(plugin) {
		this._inAppMessageClickListeners = [];
		this._willDisplayInAppMessageListeners = [];
		this._didDisplayInAppMessageListeners = [];
		this._willDismissInAppMessageListeners = [];
		this._didDismissInAppMessageListeners = [];
		this._hasRegisteredClickListener = false;
		this._hasRegisteredWillDisplayListener = false;
		this._hasRegisteredDidDisplayListener = false;
		this._hasRegisteredWillDismissListener = false;
		this._hasRegisteredDidDismissListener = false;
		this._plugin = plugin;
	}
	_processFunctionList(array, param) {
		for (let i = 0; i < array.length; i++) array[i](param);
	}
	/**
	* Add event listeners for In-App Message click and/or lifecycle events.
	* Each native event channel is bridged once per namespace instance; subsequent
	* subscribers are appended to the local list. Without this guard, hot-reload
	* cycles and effect re-runs leak orphaned bridge subscriptions that fan a
	* single native event into N JS callbacks.
	*/
	addEventListener(event, listener) {
		if (event === "click") {
			this._inAppMessageClickListeners.push(listener);
			if (!this._hasRegisteredClickListener) {
				this._hasRegisteredClickListener = true;
				this._plugin.addListener("inAppMessageClick", (json) => {
					this._processFunctionList(this._inAppMessageClickListeners, json);
				});
			}
		} else if (event === "willDisplay") {
			this._willDisplayInAppMessageListeners.push(listener);
			if (!this._hasRegisteredWillDisplayListener) {
				this._hasRegisteredWillDisplayListener = true;
				this._plugin.addListener("inAppMessageWillDisplay", (event) => {
					this._processFunctionList(this._willDisplayInAppMessageListeners, event);
				});
			}
		} else if (event === "didDisplay") {
			this._didDisplayInAppMessageListeners.push(listener);
			if (!this._hasRegisteredDidDisplayListener) {
				this._hasRegisteredDidDisplayListener = true;
				this._plugin.addListener("inAppMessageDidDisplay", (event) => {
					this._processFunctionList(this._didDisplayInAppMessageListeners, event);
				});
			}
		} else if (event === "willDismiss") {
			this._willDismissInAppMessageListeners.push(listener);
			if (!this._hasRegisteredWillDismissListener) {
				this._hasRegisteredWillDismissListener = true;
				this._plugin.addListener("inAppMessageWillDismiss", (event) => {
					this._processFunctionList(this._willDismissInAppMessageListeners, event);
				});
			}
		} else if (event === "didDismiss") {
			this._didDismissInAppMessageListeners.push(listener);
			if (!this._hasRegisteredDidDismissListener) {
				this._hasRegisteredDidDismissListener = true;
				this._plugin.addListener("inAppMessageDidDismiss", (event) => {
					this._processFunctionList(this._didDismissInAppMessageListeners, event);
				});
			}
		}
	}
	/**
	* Remove event listeners for In-App Message click and/or lifecycle events.
	* @param event
	* @param listener
	* @returns
	*/
	removeEventListener(event, listener) {
		if (event === "click") removeListener(this._inAppMessageClickListeners, listener);
		else if (event === "willDisplay") removeListener(this._willDisplayInAppMessageListeners, listener);
		else if (event === "didDisplay") removeListener(this._didDisplayInAppMessageListeners, listener);
		else if (event === "willDismiss") removeListener(this._willDismissInAppMessageListeners, listener);
		else if (event === "didDismiss") removeListener(this._didDismissInAppMessageListeners, listener);
	}
	/**
	* Add a trigger for the current user. Triggers are currently explicitly used to determine whether a specific IAM should be displayed to the user.
	* @param  {string} key
	* @param  {string} value
	* @returns Promise<void>
	*/
	addTrigger(key, value) {
		return this.addTriggers({ [key]: value });
	}
	/**
	* Add multiple triggers for the current user.
	* @param  {[key: string]: string} triggers
	* @returns Promise<void>
	*/
	addTriggers(triggers) {
		Object.keys(triggers).forEach(function(key) {
			if (typeof triggers[key] !== "string") triggers[key] = JSON.stringify(triggers[key]);
		});
		return this._plugin.addTriggers({ triggers });
	}
	/**
	* Remove the trigger with the provided key from the current user.
	* @param  {string} key
	* @returns Promise<void>
	*/
	removeTrigger(key) {
		return this.removeTriggers([key]);
	}
	/**
	* Remove multiple triggers from the current user.
	* @param  {string[]} keys
	* @returns Promise<void>
	*/
	removeTriggers(keys) {
		if (!Array.isArray(keys)) console.error("OneSignal: removeTriggers: argument must be of type Array");
		return this._plugin.removeTriggers({ keys });
	}
	/**
	* Clear all triggers from the current user.
	* @returns Promise<void>
	*/
	clearTriggers() {
		return this._plugin.clearTriggers();
	}
	/**
	* Set whether in-app messaging is currently paused.
	* @param  {boolean} pause
	* @returns void
	*/
	setPaused(pause) {
		this._plugin.setPaused({ pause });
	}
	/**
	* Whether in-app messaging is currently paused.
	* @returns {Promise<boolean>}
	*/
	async getPaused() {
		return (await this._plugin.isPaused()).paused;
	}
};
//#endregion
//#region src/LiveActivitiesNamespace.ts
var LiveActivities = class {
	constructor(plugin) {
		this._plugin = plugin;
	}
	/**
	* Enter a live activity
	* @param  {string} activityId
	* @param  {string} token
	* @param  {Function} onSuccess
	* @param  {Function} onFailure
	* @returns void
	*/
	enter(activityId, token, onSuccess, onFailure) {
		this._plugin.enterLiveActivity({
			activityId,
			token
		}).then((result) => {
			onSuccess?.(result);
		}).catch((error) => {
			onFailure?.(error);
		});
	}
	/**
	* Exit a live activity
	* @param  {string} activityId
	* @param  {Function} onSuccess
	* @param  {Function} onFailure
	* @returns void
	* @deprecated Currently unsupported, avoid using this method.
	*/
	exit(activityId, onSuccess, onFailure) {
		this._plugin.exitLiveActivity({ activityId }).then((result) => {
			onSuccess?.(result);
		}).catch((error) => {
			onFailure?.(error);
		});
	}
	/**
	* Indicate this device is capable of receiving pushToStart live activities for the
	* `activityType`. Only applies to iOS.
	* @param {string} activityType
	* @param {string} token
	*/
	setPushToStartToken(activityType, token) {
		return this._plugin.setPushToStartToken({
			activityType,
			token
		});
	}
	/**
	* Indicate this device is no longer capable of receiving pushToStart live activities
	* for the `activityType`. Only applies to iOS.
	* @param {string} activityType
	*/
	removePushToStartToken(activityType) {
		return this._plugin.removePushToStartToken({ activityType });
	}
	/**
	* Enable the OneSignalSDK to setup the default `DefaultLiveActivityAttributes` structure.
	* Only applies to iOS.
	* @param {LiveActivitySetupOptions} options
	*/
	setupDefault(options) {
		return this._plugin.setupDefaultLiveActivity(options);
	}
	/**
	* Start a new LiveActivity that is modelled by the default `DefaultLiveActivityAttributes`
	* structure. Only applies to iOS.
	* @param {string} activityId
	* @param {object} attributes
	* @param {object} content
	*/
	startDefault(activityId, attributes, content) {
		return this._plugin.startDefaultLiveActivity({
			activityId,
			attributes,
			content
		});
	}
};
//#endregion
//#region src/LocationNamespace.ts
var Location = class {
	constructor(plugin) {
		this._plugin = plugin;
	}
	/**
	* Prompts the user for location permissions to allow geotagging from the OneSignal dashboard.
	* @returns Promise<void>
	*/
	requestPermission() {
		return this._plugin.requestLocationPermission();
	}
	/**
	* Disable or enable location collection (defaults to enabled if your app has location permission).
	* @param  {boolean} shared
	* @returns void
	*/
	setShared(shared) {
		this._plugin.setLocationShared({ shared });
	}
	/**
	* Whether location is currently shared with OneSignal.
	* @returns {Promise<boolean>}
	*/
	async isShared() {
		return (await this._plugin.isLocationShared()).shared;
	}
};
//#endregion
//#region src/OSNotification.ts
let _pluginRef$1;
function _setOSNotificationPlugin(plugin) {
	_pluginRef$1 = plugin;
}
var OSNotification = class {
	constructor(receivedEvent) {
		this.notificationId = receivedEvent.notificationId;
		this.body = receivedEvent.body;
		this.title = receivedEvent.title;
		this.additionalData = receivedEvent.additionalData;
		if (typeof receivedEvent.rawPayload === "string") this.rawPayload = JSON.parse(receivedEvent.rawPayload);
		else this.rawPayload = receivedEvent.rawPayload;
		this.launchURL = receivedEvent.launchURL;
		this.sound = receivedEvent.sound;
		if (receivedEvent.actionButtons) this.actionButtons = receivedEvent.actionButtons;
		if (receivedEvent.groupKey) this.groupKey = receivedEvent.groupKey;
		if (receivedEvent.ledColor) this.ledColor = receivedEvent.ledColor;
		if (typeof receivedEvent.priority !== "undefined") this.priority = receivedEvent.priority;
		if (receivedEvent.smallIcon) this.smallIcon = receivedEvent.smallIcon;
		if (receivedEvent.largeIcon) this.largeIcon = receivedEvent.largeIcon;
		if (receivedEvent.bigPicture) this.bigPicture = receivedEvent.bigPicture;
		if (receivedEvent.collapseId) this.collapseId = receivedEvent.collapseId;
		if (receivedEvent.groupMessage) this.groupMessage = receivedEvent.groupMessage;
		if (receivedEvent.fromProjectNumber) this.fromProjectNumber = receivedEvent.fromProjectNumber;
		if (receivedEvent.smallIconAccentColor) this.smallIconAccentColor = receivedEvent.smallIconAccentColor;
		if (receivedEvent.lockScreenVisibility) this.lockScreenVisibility = receivedEvent.lockScreenVisibility;
		if (receivedEvent.androidNotificationId) this.androidNotificationId = receivedEvent.androidNotificationId;
		if (receivedEvent.groupedNotifications && receivedEvent.groupedNotifications.length) this.groupedNotifications = receivedEvent.groupedNotifications;
		if (receivedEvent.badge) this.badge = receivedEvent.badge;
		if (receivedEvent.category) this.category = receivedEvent.category;
		if (receivedEvent.threadId) this.threadId = receivedEvent.threadId;
		if (receivedEvent.subtitle) this.subtitle = receivedEvent.subtitle;
		if (receivedEvent.templateId) this.templateId = receivedEvent.templateId;
		if (receivedEvent.attachments) this.attachments = receivedEvent.attachments;
		if (receivedEvent.templateName) this.templateName = receivedEvent.templateName;
		if (receivedEvent.mutableContent) this.mutableContent = receivedEvent.mutableContent;
		if (receivedEvent.badgeIncrement) this.badgeIncrement = receivedEvent.badgeIncrement;
		if (receivedEvent.contentAvailable) this.contentAvailable = receivedEvent.contentAvailable;
		if (receivedEvent.relevanceScore) this.relevanceScore = receivedEvent.relevanceScore;
		if (receivedEvent.interruptionLevel) this.interruptionLevel = receivedEvent.interruptionLevel;
	}
	/**
	* Display the notification.
	* @returns void
	*/
	display() {
		if (_pluginRef$1) _pluginRef$1.displayNotification({ notificationId: this.notificationId });
	}
};
//#endregion
//#region src/NotificationReceivedEvent.ts
let _pluginRef;
function _setNotificationEventPlugin(plugin) {
	_pluginRef = plugin;
}
var NotificationWillDisplayEvent = class {
	constructor(displayEvent) {
		this.notification = new OSNotification(displayEvent);
	}
	/**
	* Call this to prevent OneSignal from displaying the notification automatically.
	* This method can be called up to two times with false and then true, if processing time is needed.
	* Typically this is only possible within a short
	* time-frame (~30 seconds) after the notification is received on the device.
	* @param discard an [preventDefault] set to true to dismiss the notification with no
	* possibility of displaying it in the future.
	*/
	preventDefault(discard = false) {
		if (_pluginRef) _pluginRef.preventDefault({
			notificationId: this.notification.notificationId,
			discard
		});
	}
	getNotification() {
		return this.notification;
	}
};
//#endregion
//#region src/NotificationsNamespace.ts
const OSNotificationPermission = {
	NotDetermined: 0,
	Denied: 1,
	Authorized: 2,
	Provisional: 3,
	Ephemeral: 4
};
var Notifications = class {
	constructor(plugin) {
		this._permissionObserverList = [];
		this._notificationClickedListeners = [];
		this._notificationWillDisplayListeners = [];
		this._hasRegisteredClickListener = false;
		this._hasRegisteredForegroundWillDisplayListener = false;
		this._hasRegisteredPermissionListener = false;
		this._plugin = plugin;
	}
	_processFunctionList(array, param) {
		for (let i = 0; i < array.length; i++) array[i](param);
	}
	/**
	* Whether this app has push notification permission. Returns true if the user has accepted permissions,
	* or if the app has ephemeral or provisional permission.
	*/
	async hasPermission() {
		return (await this._plugin.getPermission()).permission;
	}
	/**
	* iOS Only.
	* Returns the native permission of the device.
	* @returns {Promise<OSNotificationPermission>}
	*/
	async permissionNative() {
		return (await this._plugin.permissionNative()).permission;
	}
	/**
	* Prompt the user for permission to receive push notifications.
	* Use the fallbackToSettings parameter to prompt to open the settings app if a user has already declined push permissions.
	* @param  {boolean} fallbackToSettings
	* @returns {Promise<boolean>}
	*/
	async requestPermission(fallbackToSettings) {
		const fallback = fallbackToSettings ?? false;
		return (await this._plugin.requestPermission({ fallbackToSettings: fallback })).permission;
	}
	/**
	* Whether attempting to request notification permission will show a prompt.
	* Returns true if the device has not been prompted for push notification permission already.
	* @returns {Promise<boolean>}
	*/
	async canRequestPermission() {
		return (await this._plugin.canRequestPermission()).canRequest;
	}
	/**
	* iOS Only.
	* Instead of having to prompt the user for permission to send them push notifications,
	* your app can request provisional authorization.
	* @param  {(response: boolean)=>void} handler
	* @returns void
	*/
	registerForProvisionalAuthorization(handler) {
		this._plugin.registerForProvisionalAuthorization().then((result) => {
			handler?.(result.accepted);
		});
	}
	/**
	* Add listeners for notification events.
	* @param event
	* @param listener
	* @returns
	*/
	addEventListener(event, listener) {
		if (event === "click") {
			this._notificationClickedListeners.push(listener);
			if (!this._hasRegisteredClickListener) {
				this._hasRegisteredClickListener = true;
				this._plugin.addListener("notificationClick", (json) => {
					this._processFunctionList(this._notificationClickedListeners, json);
				});
			}
		} else if (event === "foregroundWillDisplay") {
			this._notificationWillDisplayListeners.push(listener);
			if (!this._hasRegisteredForegroundWillDisplayListener) {
				this._hasRegisteredForegroundWillDisplayListener = true;
				this._foregroundWillDisplayListenerHandle = this._plugin.addListener("notificationForegroundWillDisplay", (notification) => {
					this._notificationWillDisplayListeners.forEach((listener) => {
						listener(new NotificationWillDisplayEvent(notification));
					});
					this._plugin.proceedWithWillDisplay({ notificationId: notification.notificationId });
				});
			}
		} else if (event === "permissionChange") {
			this._permissionObserverList.push(listener);
			if (!this._hasRegisteredPermissionListener) {
				this._hasRegisteredPermissionListener = true;
				this._plugin.addListener("permissionChange", (state) => {
					this._processFunctionList(this._permissionObserverList, state.permission);
				});
			}
		}
	}
	/**
	* Remove listeners for notification events.
	* @param event
	* @param listener
	* @returns
	*/
	removeEventListener(event, listener) {
		if (event === "click") removeListener(this._notificationClickedListeners, listener);
		else if (event === "foregroundWillDisplay") {
			removeListener(this._notificationWillDisplayListeners, listener);
			if (this._notificationWillDisplayListeners.length === 0) {
				this._hasRegisteredForegroundWillDisplayListener = false;
				const listenerHandle = this._foregroundWillDisplayListenerHandle;
				this._foregroundWillDisplayListenerHandle = void 0;
				listenerHandle?.then((handle) => handle.remove());
			}
		} else if (event === "permissionChange") removeListener(this._permissionObserverList, listener);
	}
	/**
	* Removes all OneSignal notifications.
	* @returns Promise<void>
	*/
	clearAll() {
		return this._plugin.clearAllNotifications();
	}
	/**
	* Android only.
	* Cancels a single OneSignal notification based on its Android notification integer ID.
	* @param  {number} id - notification id to cancel
	* @returns Promise<void>
	*/
	removeNotification(id) {
		return this._plugin.removeNotification({ id });
	}
	/**
	* Android only.
	* Cancels a group of OneSignal notifications with the provided group key.
	* @param  {string} id - notification group id to cancel
	* @returns Promise<void>
	*/
	removeGroupedNotifications(id) {
		return this._plugin.removeGroupedNotifications({ id });
	}
};
//#endregion
//#region src/SessionNamespace.ts
var Session = class {
	constructor(plugin) {
		this._plugin = plugin;
	}
	/**
	* Add an outcome with the provided name, captured against the current session.
	* @param  {string} name
	* @returns Promise<void>
	*/
	addOutcome(name) {
		return this._plugin.addOutcome({ name });
	}
	/**
	* Add a unique outcome with the provided name, captured against the current session.
	* @param  {string} name
	* @returns Promise<void>
	*/
	addUniqueOutcome(name) {
		return this._plugin.addUniqueOutcome({ name });
	}
	/**
	* Add an outcome with the provided name and value, captured against the current session.
	* @param  {string} name
	* @param  {number} value
	* @returns Promise<void>
	*/
	addOutcomeWithValue(name, value) {
		return this._plugin.addOutcomeWithValue({
			name,
			value
		});
	}
};
//#endregion
//#region src/PushSubscriptionNamespace.ts
var PushSubscription = class {
	constructor(plugin) {
		this._subscriptionObserverList = [];
		this._hasRegisteredChangeListener = false;
		this._plugin = plugin;
	}
	_processFunctionList(array, param) {
		for (let i = 0; i < array.length; i++) array[i](param);
	}
	/**
	* The readonly push subscription ID.
	* @returns {Promise<string | null>}
	*/
	async getIdAsync() {
		return (await this._plugin.getPushSubscriptionId()).id;
	}
	/**
	* The readonly push token.
	* @returns {Promise<string | null>}
	*/
	async getTokenAsync() {
		return (await this._plugin.getPushSubscriptionToken()).token;
	}
	/**
	* Gets a boolean value indicating whether the current user is opted in to push notifications.
	* This returns true when the app has notifications permission and optOut() is NOT called.
	* Note: Does not take into account the existence of the subscription ID and push token.
	* This boolean may return true but push notifications may still not be received by the user.
	* @returns {Promise<boolean>}
	*/
	async getOptedInAsync() {
		return (await this._plugin.getPushSubscriptionOptedIn()).optedIn;
	}
	/**
	* Add a callback that fires when the OneSignal push subscription state changes.
	* The bridge subscription is registered once per namespace instance; subsequent
	* subscribers append to the local list to avoid orphaned bridge handlers
	* across hot-reload cycles.
	*/
	addEventListener(_event, listener) {
		this._subscriptionObserverList.push(listener);
		if (!this._hasRegisteredChangeListener) {
			this._hasRegisteredChangeListener = true;
			this._plugin.addListener("pushSubscriptionChange", (state) => {
				this._processFunctionList(this._subscriptionObserverList, state);
			});
		}
	}
	/**
	* Remove a push subscription observer that has been previously added.
	* @param  {(event: PushSubscriptionChangedState)=>void} listener
	* @returns void
	*/
	removeEventListener(_event, listener) {
		removeListener(this._subscriptionObserverList, listener);
	}
	/**
	* Call this method to receive push notifications on the device or to resume receiving of push notifications after calling optOut. If needed, this method will prompt the user for push notifications permission.
	* @returns Promise<void>
	*/
	optIn() {
		return this._plugin.optInPushSubscription();
	}
	/**
	* If at any point you want the user to stop receiving push notifications on the current device (regardless of system-level permission status), you can call this method to opt out.
	* @returns Promise<void>
	*/
	optOut() {
		return this._plugin.optOutPushSubscription();
	}
};
//#endregion
//#region src/UserNamespace.ts
var User = class {
	constructor(plugin) {
		this._userStateObserverList = [];
		this._hasRegisteredChangeListener = false;
		this._plugin = plugin;
		this.pushSubscription = new PushSubscription(plugin);
	}
	_processFunctionList(array, param) {
		for (let i = 0; i < array.length; i++) array[i](param);
	}
	/**
	* Explicitly set a 2-character language code for the user.
	* @param  {string} language
	* @returns Promise<void>
	*/
	setLanguage(language) {
		return this._plugin.setLanguage({ language });
	}
	/**
	* Set an alias for the current user. If this alias label already exists on this user, it will be overwritten with the new alias id.
	* @param  {string} label
	* @param  {string} id
	* @returns Promise<void>
	*/
	addAlias(label, id) {
		return this._plugin.addAliases({ aliases: { [label]: id } });
	}
	/**
	* Set aliases for the current user. If any alias already exists, it will be overwritten to the new values.
	* @param {object} aliases
	* @returns Promise<void>
	*/
	addAliases(aliases) {
		return this._plugin.addAliases({ aliases });
	}
	/**
	* Remove an alias from the current user.
	* @param  {string} label
	* @returns Promise<void>
	*/
	removeAlias(label) {
		return this._plugin.removeAliases({ labels: [label] });
	}
	/**
	* Remove aliases from the current user.
	* @param  {string[]} labels
	* @returns Promise<void>
	*/
	removeAliases(labels) {
		return this._plugin.removeAliases({ labels });
	}
	/**
	* Add a new email subscription to the current user.
	* @param  {string} email
	* @returns Promise<void>
	*/
	addEmail(email) {
		return this._plugin.addEmail({ email });
	}
	/**
	* Remove an email subscription from the current user.
	* @param {string} email
	* @returns Promise<void>
	*/
	removeEmail(email) {
		return this._plugin.removeEmail({ email });
	}
	/**
	* Add a new SMS subscription to the current user.
	* @param  {string} smsNumber
	* @returns Promise<void>
	*/
	addSms(smsNumber) {
		return this._plugin.addSms({ smsNumber });
	}
	/**
	* Remove an SMS subscription from the current user.
	* @param {string} smsNumber
	* @returns Promise<void>
	*/
	removeSms(smsNumber) {
		return this._plugin.removeSms({ smsNumber });
	}
	/**
	* Add a tag for the current user. Tags are key:value string pairs used as building blocks for targeting specific users and/or personalizing messages.
	* @param  {string} key
	* @param  {string} value
	* @returns Promise<void>
	*/
	addTag(key, value) {
		return this._plugin.addTags({ tags: { [key]: value } });
	}
	/**
	* Add multiple tags for the current user. Tags are key:value string pairs used as building blocks for targeting specific users and/or personalizing messages.
	* @param  {object} tags
	* @returns Promise<void>
	*/
	addTags(tags) {
		const convertedTags = tags;
		Object.keys(tags).forEach(function(key) {
			if (typeof convertedTags[key] !== "string") convertedTags[key] = JSON.stringify(convertedTags[key]);
		});
		return this._plugin.addTags({ tags: convertedTags });
	}
	/**
	* Remove the data tag with the provided key from the current user.
	* @param  {string} key
	* @returns Promise<void>
	*/
	removeTag(key) {
		return this._plugin.removeTags({ keys: [key] });
	}
	/**
	* Remove multiple tags with the provided keys from the current user.
	* @param  {string[]} keys
	* @returns Promise<void>
	*/
	removeTags(keys) {
		return this._plugin.removeTags({ keys });
	}
	/**
	* Returns the local tags for the current user.
	* @returns Promise<{ [key: string]: string }>
	*/
	async getTags() {
		return (await this._plugin.getTags()).tags;
	}
	/**
	* Add a callback that fires when the OneSignal User state changes.
	* The bridge subscription is registered once per namespace instance; subsequent
	* subscribers append to the local list to avoid orphaned bridge handlers
	* across hot-reload cycles.
	*/
	addEventListener(_event, listener) {
		this._userStateObserverList.push(listener);
		if (!this._hasRegisteredChangeListener) {
			this._hasRegisteredChangeListener = true;
			this._plugin.addListener("userStateChange", (state) => {
				this._processFunctionList(this._userStateObserverList, state);
			});
		}
	}
	/**
	* Remove a User State observer that has been previously added.
	* @param  {(event: UserChangedState)=>void} listener
	* @returns void
	*/
	removeEventListener(_event, listener) {
		removeListener(this._userStateObserverList, listener);
	}
	/**
	* Get the nullable OneSignal Id associated with the current user.
	* @returns {Promise<string | null>}
	*/
	async getOnesignalId() {
		return (await this._plugin.getOnesignalId()).onesignalId;
	}
	/**
	* Get the nullable External Id associated with the current user.
	* @returns {Promise<string | null>}
	*/
	async getExternalId() {
		return (await this._plugin.getExternalId()).externalId;
	}
	/**
	* Track a custom event with the provided name and optional properties.
	* @param  {string} name - The name of the custom event
	* @param  {object} [properties] - Optional properties to associate with the event
	* @returns Promise<void>
	*/
	trackEvent(name, properties) {
		if (properties !== void 0 && !isObjectSerializable(properties)) {
			console.error("Properties must be a JSON-serializable object");
			return Promise.resolve();
		}
		return this._plugin.trackEvent({
			name,
			properties
		});
	}
};
//#endregion
//#region src/OneSignalPlugin.ts
var OneSignalPlugin = class {
	constructor(plugin) {
		this._appID = "";
		this._plugin = plugin;
		_setOSNotificationPlugin(plugin);
		_setNotificationEventPlugin(plugin);
		this.User = new User(plugin);
		this.Debug = new Debug(plugin);
		this.Session = new Session(plugin);
		this.Location = new Location(plugin);
		this.InAppMessages = new InAppMessages(plugin);
		this.Notifications = new Notifications(plugin);
		this.LiveActivities = new LiveActivities(plugin);
	}
	/**
	* Initializes the OneSignal SDK. This should be called during startup of the application.
	* @param  {string} appId
	* @returns Promise<void>
	*/
	initialize(appId) {
		this._appID = appId;
		return this._plugin.initialize({ appId: this._appID });
	}
	/**
	* Login to OneSignal under the user identified by the [externalId] provided. The act of logging a user into the OneSignal SDK will switch the [user] context to that specific user.
	* @param  {string} externalId
	* @returns Promise<void>
	*/
	login(externalId) {
		return this._plugin.login({ externalId });
	}
	/**
	* Logout the user previously logged in via [login]. The [user] property now references a new device-scoped user.
	* @returns Promise<void>
	*/
	logout() {
		return this._plugin.logout();
	}
	/**
	* Determines whether a user must consent to privacy prior to their user data being sent up to OneSignal. This should be set to true prior to the invocation of initialization to ensure compliance.
	* @param  {boolean} required
	* @returns void
	*/
	setConsentRequired(required) {
		this._plugin.setConsentRequired({ required });
	}
	/**
	* Indicates whether privacy consent has been granted. This field is only relevant when the application has opted into data privacy protections.
	* @param  {boolean} granted
	* @returns void
	*/
	setConsentGiven(granted) {
		this._plugin.setConsentGiven({ granted });
	}
};
//#endregion
//#region src/index.ts
const OneSignal = new OneSignalPlugin(registerPlugin("OneSignalCapacitor"));
//#endregion
export { LogLevel, NotificationWillDisplayEvent, OSNotification, OSNotificationPermission, OneSignalPlugin, OneSignal as default };
