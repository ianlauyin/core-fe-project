import {ConnectedRouter} from "connected-react-router";
import {Location} from "history";
import React from "react";
import ReactDOM from "react-dom";
import {Provider} from "react-redux";
import {app} from "../app";
import {NavigationGuard} from "./NavigationGuard";
import {LoggerConfig} from "../Logger";
import {ErrorListener, executeAction} from "../module";
import {ErrorBoundary} from "../util/ErrorBoundary";
import {ajax} from "../util/network";
import {APIException} from "../Exception";
import {isIEBrowser} from "../util/navigator-util";
import {captureError, errorToException} from "../util/error-util";
import {SagaIterator, call, delay} from "../typed-saga";
import {registerPerformanceTracker} from "./performance-tracker";

/**
 * Configuration for frontend version check.
 * If the version changes (by sending GET request to `versionCheckURL`) over `thresholdHours` (default: 24), `onRemind` will be executed.
 *
 * Suggested Approach:
 * - onRemind: Alert to end-user for page refresh
 * - versionCheckURL: Respond a JSON based on computed bundled index.html content, whose contained JS/CSS file name changes when version changes.
 */
interface VersionConfig {
    onRemind: () => SagaIterator;
    versionCheckURL: string; // Must be GET Method, returning whatever JSON
    thresholdHours?: number; // Default: 24
}

/**
 * Configuration for browser related features.
 * - onIE: Alert to user or redirect when using IE browser, because framework does not support IE.
 * - onLocationChange: A global event handler for any location change events.
 * - navigationPreventionMessage: Only useful if you are leaving some page, whose "setNavigationPrevented" is toggled as true.
 */
interface BrowserConfig {
    onIE?: () => void;
    onLocationChange?: (location: Location) => void;
    navigationPreventionMessage?: string;
}

interface BootstrapOption {
    componentType: React.ComponentType;
    errorListener: ErrorListener;
    browserConfig?: BrowserConfig;
    loggerConfig?: LoggerConfig;
    versionConfig?: VersionConfig;
}

export const LOGGER_ACTION = "@@framework/logger";
export const VERSION_CHECK_ACTION = "@@framework/version-check";
export const GLOBAL_ERROR_ACTION = "@@framework/global";
export const GLOBAL_PROMISE_REJECTION_ACTION = "@@framework/promise-rejection";

export function startApp(option: BootstrapOption): void {
    detectIEBrowser(option.browserConfig?.onIE);
    setupGlobalErrorHandler(option.errorListener);
    setupAppExitListener(option.loggerConfig?.serverURL);
    setupLocationChangeListener(option.browserConfig?.onLocationChange);
    runBackgroundLoop(option.loggerConfig, option.versionConfig);
    renderRoot(option.componentType, option.browserConfig?.navigationPreventionMessage || "Are you sure to leave current page?");
}

function detectIEBrowser(onIE?: () => void) {
    if (isIEBrowser()) {
        if (onIE) {
            onIE();
        } else {
            let ieAlertMessage: string;
            const navigatorLanguage = navigator.languages ? navigator.languages[0] : navigator.language;
            if (navigatorLanguage.startsWith("zh")) {
                ieAlertMessage = "对不起，本网站不支持 IE 浏览器\n请使用 Chrome/Firefox/360 浏览器再访问";
            } else {
                ieAlertMessage = "This website does not support IE browser.\nPlease use Chrome/Safari/Firefox to visit.\nSorry for the inconvenience.";
            }
            alert(ieAlertMessage);
        }
        // After that, the following code may still run
    }
}

function setupGlobalErrorHandler(errorListener: ErrorListener) {
    app.errorHandler = errorListener.onError.bind(errorListener);
    window.addEventListener(
        "error",
        (event) => {
            try {
                const analyzeByTarget = (): string => {
                    if (event.target && event.target !== window) {
                        const element = event.target as HTMLElement;
                        return `DOM source error: ${element.outerHTML}`;
                    }
                    return `Unrecognized error, serialized as ${JSON.stringify(event)}`;
                };
                captureError(event.error || event.message || analyzeByTarget(), GLOBAL_ERROR_ACTION);
            } catch (e) {
                /**
                 * This should not happen normally.
                 * However, global error handler might catch external webpage errors, and fail to parse error due to cross-origin limitations.
                 * A typical example is: Permission denied to access property `foo`
                 */
                app.logger.warn({
                    action: GLOBAL_ERROR_ACTION,
                    errorCode: "ERROR_HANDLER_FAILURE",
                    errorMessage: errorToException(e).message,
                    elapsedTime: 0,
                    info: {},
                });
            }
        },
        true
    );
    window.addEventListener(
        "unhandledrejection",
        (event) => {
            try {
                captureError(event.reason, GLOBAL_PROMISE_REJECTION_ACTION);
            } catch (e) {
                app.logger.warn({
                    action: GLOBAL_PROMISE_REJECTION_ACTION,
                    errorCode: "ERROR_HANDLER_FAILURE",
                    errorMessage: errorToException(e).message,
                    elapsedTime: 0,
                    info: {},
                });
            }
        },
        true
    );
}

function renderRoot(EntryComponent: React.ComponentType, navigationPreventionMessage: string) {
    const rootElement: HTMLDivElement = document.createElement("div");
    rootElement.style.transition = "all 150ms ease-in 100ms";
    rootElement.style.opacity = "0";
    rootElement.style.transform = "translateY(-10px) scale(0.96)";
    rootElement.id = "framework-app-root";
    document.body.appendChild(rootElement);

    ReactDOM.render(
        <Provider store={app.store}>
            <ConnectedRouter history={app.browserHistory}>
                <NavigationGuard message={navigationPreventionMessage} />
                <ErrorBoundary>
                    <EntryComponent />
                </ErrorBoundary>
            </ConnectedRouter>
        </Provider>,
        rootElement,
        () => {
            const rootElement = document.getElementById("framework-app-root")!;
            rootElement.style.transform = "none";
            rootElement.style.opacity = "1";
        }
    );
}

function setupAppExitListener(eventServerURL?: string) {
    if (eventServerURL) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.platform);
        window.addEventListener(
            // Ref: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html#//apple_ref/doc/uid/TP40006511-SW5
            isIOS ? "pagehide" : "unload",
            () => {
                try {
                    app.logger.info("@@EXIT", {});
                    const logs = app.logger.collect();
                    /**
                     * navigator.sendBeacon() uses HTTP POST, but does not support CORS.
                     * We have to use text/plain as content type, instead of JSON.
                     */
                    const textData = JSON.stringify({events: logs});
                    navigator.sendBeacon(eventServerURL, textData);
                } catch (e) {
                    // Silent if sending error
                }
            },
            false
        );
    }
}

function setupLocationChangeListener(listener?: (location: Location) => void) {
    if (listener) {
        app.browserHistory.listen(listener);
    }
}

function runBackgroundLoop(loggerConfig?: LoggerConfig, updateReminderConfig?: VersionConfig) {
    app.logger.info("@@ENTER", {});
    app.loggerConfig = loggerConfig || null;
    if (loggerConfig?.performanceLogging) {
        registerPerformanceTracker();
    }

    app.sagaMiddleware.run(function* () {
        let lastChecksumTimestamp = 0;
        let lastChecksum: string | null = null;
        while (true) {
            // Loop on every 30 second
            yield delay(30000);

            // Send collected log to event server
            if (loggerConfig) {
                yield* call(sendEventLogs, loggerConfig.serverURL);
            }

            // Check if staying too long, then check if need refresh by comparing server-side checksum
            if (updateReminderConfig) {
                const stayingHours = (Date.now() - lastChecksumTimestamp) / 3600 / 1000;
                if (stayingHours > (updateReminderConfig.thresholdHours || 24)) {
                    const newChecksum = yield* call(fetchVersionChecksum, updateReminderConfig.versionCheckURL);
                    if (newChecksum) {
                        if (lastChecksum !== null && newChecksum !== lastChecksum) {
                            app.logger.warn({
                                action: VERSION_CHECK_ACTION,
                                errorMessage: `Frontend version changed, page no refresh for ${stayingHours.toFixed(2)} hrs`,
                                errorCode: "VERSION_CHANGED",
                                elapsedTime: 0,
                                info: {newChecksum, lastChecksum},
                            });
                            yield* executeAction(VERSION_CHECK_ACTION, updateReminderConfig.onRemind);
                        }
                        lastChecksum = newChecksum;
                        lastChecksumTimestamp = Date.now();
                    }
                }
            }
        }
    });
}

export async function sendEventLogs(serverURL: string): Promise<void> {
    try {
        const logs = app.logger.collect();
        if (logs.length > 0) {
            /**
             * Event server URL may be different from current domain (supposing abc.com)
             *
             * In order to support this, we must ensure:
             * - Event server allows cross-origin request from current domain
             * - Root-domain cookies, whose domain is set by current domain as ".abc.com", can be sent (withCredentials = true)
             */
            await ajax("POST", serverURL, {}, {events: logs}, {withCredentials: true});
            app.logger.empty();
        }
    } catch (e) {
        if (e instanceof APIException) {
            // For APIException, retry always leads to same error, so have to give up
            // Do not log network exceptions
            const length = app.logger.collect().length;
            app.logger.empty();
            app.logger.exception(e, {droppedLogs: length.toString()}, LOGGER_ACTION);
        }
    }
}

/**
 * Only call this function if necessary, i.e: initial checksum, or after long-staying check
 * Return latest checksum, or null for failure.
 */
async function fetchVersionChecksum(url: string): Promise<string | null> {
    try {
        const startTimestamp = Date.now();
        const response = await ajax("GET", url, {}, null);
        const checksum = JSON.stringify(response);
        app.logger.info(VERSION_CHECK_ACTION, {checksum}, Date.now() - startTimestamp);
        return checksum;
    } catch (e) {
        if (e instanceof APIException) {
            // Do not log network exceptions
            app.logger.exception(errorToException(e), {}, VERSION_CHECK_ACTION);
        }
        return null;
    }
}
