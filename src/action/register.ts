import {setStateAction} from "./setState";
import {LOCATION_CHANGE} from "connected-react-router";
import ReactDOM from "react-dom";
import {SagaIterator} from "redux-saga";
import {call} from "redux-saga/effects";
import {App} from "../type";
import {ERROR_ACTION_TYPE} from "./error";
import {Handler, run} from "./handler";
import {Listener, LocationChangedEvent, tick, TickListener} from "./listener";
import {EffectHandler} from "./store";

export function registerHandler(handler: Handler<any>, app: App) {
    keys(handler).forEach(actionType => {
        const method = handler[actionType];
        const qualifiedActionType = `${handler.namespace}/${actionType}`;
        app.handlers.effects[qualifiedActionType] = effectHandler(method, handler);
    });

    // Use "as any" to get private-readonly initialState
    const initialState = (handler as any).initialState;
    app.store.dispatch(setStateAction(handler.namespace, initialState));
    registerListener(handler, app);
}

export function keys(handler: Handler<any>): string[] {
    // There is always constructor in handler regardless declared in js
    return Object.keys(Object.getPrototypeOf(handler)).filter(key => key !== "constructor");
}

function effectHandler(method: EffectHandler, handler: Handler<any>): EffectHandler {
    const boundMethod: EffectHandler = method.bind(handler);
    return boundMethod;
}

function registerListener(handler: Handler<any>, app: App) {
    const listener = handler as Listener;
    if (listener.onLocationChanged) {
        app.handlers.listenerEffects[LOCATION_CHANGE].push(effectHandler(listener.onLocationChanged, handler));
    }
    if (listener.onError) {
        app.handlers.listenerEffects[ERROR_ACTION_TYPE].push(effectHandler(listener.onError, handler));
    }

    app.sagaMiddleware.run(initializeListener, handler, app);
}

// Initialize module in one effect to make it deterministic, onInitialized -> onLocationChanged -> onTick (repeated)
function* initializeListener(handler: Handler<any>, app: App): SagaIterator {
    const listener = handler as Listener;
    if (listener.onInitialized) {
        yield call(run, effectHandler(listener.onInitialized, handler), []);
    }

    if (listener.onLocationChanged) {
        const event: LocationChangedEvent = {location: app.history.location, action: "PUSH"};
        yield call(run, effectHandler(listener.onLocationChanged, handler), [event]); // History listener won't trigger on first refresh or on module loading, manual trigger once
    }

    // Remove startup overlay
    app.moduleLoaded[handler.namespace] = true;
    if (Object.values(app.moduleLoaded).every(_ => _)) {
        setTimeout(() => {
            const startupElement: HTMLElement | null = document.getElementById("framework-startup-overlay");
            if (startupElement && startupElement.parentNode) {
                ReactDOM.unmountComponentAtNode(startupElement); // Remove Virtual-DOM from React
                startupElement.parentNode.removeChild(startupElement);
            }
        }, 10);
    }

    const onTick = listener.onTick as TickListener;
    if (onTick) {
        const tickHandler = effectHandler(onTick, handler) as TickListener;
        tickHandler.interval = onTick.interval;
        yield* tick(tickHandler);
    }
}
