var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,n)=>{let r={};for(var i in e)t(r,i,{get:e[i],enumerable:!0});return n||t(r,Symbol.toStringTag,{value:`Module`}),r},c=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},l=(n,r,o)=>(o=n==null?{}:e(i(n)),c(r||!n||!n.__esModule||!a.call(n,`default`)?t(o,`default`,{value:n,enumerable:!0}):o,n));(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var u=o((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.portal`),r=Symbol.for(`react.fragment`),i=Symbol.for(`react.strict_mode`),a=Symbol.for(`react.profiler`),o=Symbol.for(`react.consumer`),s=Symbol.for(`react.context`),c=Symbol.for(`react.forward_ref`),l=Symbol.for(`react.suspense`),u=Symbol.for(`react.memo`),d=Symbol.for(`react.lazy`),f=Symbol.for(`react.activity`),p=Symbol.iterator;function m(e){return typeof e!=`object`||!e?null:(e=p&&e[p]||e[`@@iterator`],typeof e==`function`?e:null)}var h={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},g=Object.assign,_={};function v(e,t,n){this.props=e,this.context=t,this.refs=_,this.updater=n||h}v.prototype.isReactComponent={},v.prototype.setState=function(e,t){if(typeof e!=`object`&&typeof e!=`function`&&e!=null)throw Error(`takes an object of state variables to update or a function which returns an object of state variables.`);this.updater.enqueueSetState(this,e,t,`setState`)},v.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,`forceUpdate`)};function y(){}y.prototype=v.prototype;function b(e,t,n){this.props=e,this.context=t,this.refs=_,this.updater=n||h}var x=b.prototype=new y;x.constructor=b,g(x,v.prototype),x.isPureReactComponent=!0;var S=Array.isArray;function C(){}var w={H:null,A:null,T:null,S:null},T=Object.prototype.hasOwnProperty;function E(e,n,r){var i=r.ref;return{$$typeof:t,type:e,key:n,ref:i===void 0?null:i,props:r}}function ee(e,t){return E(e.type,t,e.props)}function D(e){return typeof e==`object`&&!!e&&e.$$typeof===t}function O(e){var t={"=":`=0`,":":`=2`};return`$`+e.replace(/[=:]/g,function(e){return t[e]})}var te=/\/+/g;function ne(e,t){return typeof e==`object`&&e&&e.key!=null?O(``+e.key):t.toString(36)}function re(e){switch(e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason;default:switch(typeof e.status==`string`?e.then(C,C):(e.status=`pending`,e.then(function(t){e.status===`pending`&&(e.status=`fulfilled`,e.value=t)},function(t){e.status===`pending`&&(e.status=`rejected`,e.reason=t)})),e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason}}throw e}function ie(e,r,i,a,o){var s=typeof e;(s===`undefined`||s===`boolean`)&&(e=null);var c=!1;if(e===null)c=!0;else switch(s){case`bigint`:case`string`:case`number`:c=!0;break;case`object`:switch(e.$$typeof){case t:case n:c=!0;break;case d:return c=e._init,ie(c(e._payload),r,i,a,o)}}if(c)return o=o(e),c=a===``?`.`+ne(e,0):a,S(o)?(i=``,c!=null&&(i=c.replace(te,`$&/`)+`/`),ie(o,r,i,``,function(e){return e})):o!=null&&(D(o)&&(o=ee(o,i+(o.key==null||e&&e.key===o.key?``:(``+o.key).replace(te,`$&/`)+`/`)+c)),r.push(o)),1;c=0;var l=a===``?`.`:a+`:`;if(S(e))for(var u=0;u<e.length;u++)a=e[u],s=l+ne(a,u),c+=ie(a,r,i,s,o);else if(u=m(e),typeof u==`function`)for(e=u.call(e),u=0;!(a=e.next()).done;)a=a.value,s=l+ne(a,u++),c+=ie(a,r,i,s,o);else if(s===`object`){if(typeof e.then==`function`)return ie(re(e),r,i,a,o);throw r=String(e),Error(`Objects are not valid as a React child (found: `+(r===`[object Object]`?`object with keys {`+Object.keys(e).join(`, `)+`}`:r)+`). If you meant to render a collection of children, use an array instead.`)}return c}function ae(e,t,n){if(e==null)return e;var r=[],i=0;return ie(e,r,``,``,function(e){return t.call(n,e,i++)}),r}function oe(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(t){(e._status===0||e._status===-1)&&(e._status=1,e._result=t)},function(t){(e._status===0||e._status===-1)&&(e._status=2,e._result=t)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var k=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},A={map:ae,forEach:function(e,t,n){ae(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return ae(e,function(){t++}),t},toArray:function(e){return ae(e,function(e){return e})||[]},only:function(e){if(!D(e))throw Error(`React.Children.only expected to receive a single React element child.`);return e}};e.Activity=f,e.Children=A,e.Component=v,e.Fragment=r,e.Profiler=a,e.PureComponent=b,e.StrictMode=i,e.Suspense=l,e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=w,e.__COMPILER_RUNTIME={__proto__:null,c:function(e){return w.H.useMemoCache(e)}},e.cache=function(e){return function(){return e.apply(null,arguments)}},e.cacheSignal=function(){return null},e.cloneElement=function(e,t,n){if(e==null)throw Error(`The argument must be a React element, but you passed `+e+`.`);var r=g({},e.props),i=e.key;if(t!=null)for(a in t.key!==void 0&&(i=``+t.key),t)!T.call(t,a)||a===`key`||a===`__self`||a===`__source`||a===`ref`&&t.ref===void 0||(r[a]=t[a]);var a=arguments.length-2;if(a===1)r.children=n;else if(1<a){for(var o=Array(a),s=0;s<a;s++)o[s]=arguments[s+2];r.children=o}return E(e.type,i,r)},e.createContext=function(e){return e={$$typeof:s,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:o,_context:e},e},e.createElement=function(e,t,n){var r,i={},a=null;if(t!=null)for(r in t.key!==void 0&&(a=``+t.key),t)T.call(t,r)&&r!==`key`&&r!==`__self`&&r!==`__source`&&(i[r]=t[r]);var o=arguments.length-2;if(o===1)i.children=n;else if(1<o){for(var s=Array(o),c=0;c<o;c++)s[c]=arguments[c+2];i.children=s}if(e&&e.defaultProps)for(r in o=e.defaultProps,o)i[r]===void 0&&(i[r]=o[r]);return E(e,a,i)},e.createRef=function(){return{current:null}},e.forwardRef=function(e){return{$$typeof:c,render:e}},e.isValidElement=D,e.lazy=function(e){return{$$typeof:d,_payload:{_status:-1,_result:e},_init:oe}},e.memo=function(e,t){return{$$typeof:u,type:e,compare:t===void 0?null:t}},e.startTransition=function(e){var t=w.T,n={};w.T=n;try{var r=e(),i=w.S;i!==null&&i(n,r),typeof r==`object`&&r&&typeof r.then==`function`&&r.then(C,k)}catch(e){k(e)}finally{t!==null&&n.types!==null&&(t.types=n.types),w.T=t}},e.unstable_useCacheRefresh=function(){return w.H.useCacheRefresh()},e.use=function(e){return w.H.use(e)},e.useActionState=function(e,t,n){return w.H.useActionState(e,t,n)},e.useCallback=function(e,t){return w.H.useCallback(e,t)},e.useContext=function(e){return w.H.useContext(e)},e.useDebugValue=function(){},e.useDeferredValue=function(e,t){return w.H.useDeferredValue(e,t)},e.useEffect=function(e,t){return w.H.useEffect(e,t)},e.useEffectEvent=function(e){return w.H.useEffectEvent(e)},e.useId=function(){return w.H.useId()},e.useImperativeHandle=function(e,t,n){return w.H.useImperativeHandle(e,t,n)},e.useInsertionEffect=function(e,t){return w.H.useInsertionEffect(e,t)},e.useLayoutEffect=function(e,t){return w.H.useLayoutEffect(e,t)},e.useMemo=function(e,t){return w.H.useMemo(e,t)},e.useOptimistic=function(e,t){return w.H.useOptimistic(e,t)},e.useReducer=function(e,t,n){return w.H.useReducer(e,t,n)},e.useRef=function(e){return w.H.useRef(e)},e.useState=function(e){return w.H.useState(e)},e.useSyncExternalStore=function(e,t,n){return w.H.useSyncExternalStore(e,t,n)},e.useTransition=function(){return w.H.useTransition()},e.version=`19.2.8`})),d=o(((e,t)=>{t.exports=u()})),f=o((e=>{function t(e,t){var n=e.length;e.push(t);a:for(;0<n;){var r=n-1>>>1,a=e[r];if(0<i(a,t))e[r]=t,e[n]=a,n=r;else break a}}function n(e){return e.length===0?null:e[0]}function r(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;a:for(var r=0,a=e.length,o=a>>>1;r<o;){var s=2*(r+1)-1,c=e[s],l=s+1,u=e[l];if(0>i(c,n))l<a&&0>i(u,c)?(e[r]=u,e[l]=n,r=l):(e[r]=c,e[s]=n,r=s);else if(l<a&&0>i(u,n))e[r]=u,e[l]=n,r=l;else break a}}return t}function i(e,t){var n=e.sortIndex-t.sortIndex;return n===0?e.id-t.id:n}if(e.unstable_now=void 0,typeof performance==`object`&&typeof performance.now==`function`){var a=performance;e.unstable_now=function(){return a.now()}}else{var o=Date,s=o.now();e.unstable_now=function(){return o.now()-s}}var c=[],l=[],u=1,d=null,f=3,p=!1,m=!1,h=!1,g=!1,_=typeof setTimeout==`function`?setTimeout:null,v=typeof clearTimeout==`function`?clearTimeout:null,y=typeof setImmediate<`u`?setImmediate:null;function b(e){for(var i=n(l);i!==null;){if(i.callback===null)r(l);else if(i.startTime<=e)r(l),i.sortIndex=i.expirationTime,t(c,i);else break;i=n(l)}}function x(e){if(h=!1,b(e),!m){if(n(c)!==null)m=!0,S||(S=!0,D());else{var t=n(l);t!==null&&ne(x,t.startTime-e)}}}var S=!1,C=-1,w=5,T=-1;function E(){return g?!0:!(e.unstable_now()-T<w)}function ee(){if(g=!1,S){var t=e.unstable_now();T=t;var i=!0;try{a:{m=!1,h&&(h=!1,v(C),C=-1),p=!0;var a=f;try{b:{for(b(t),d=n(c);d!==null&&!(d.expirationTime>t&&E());){var o=d.callback;if(typeof o==`function`){d.callback=null,f=d.priorityLevel;var s=o(d.expirationTime<=t);if(t=e.unstable_now(),typeof s==`function`){d.callback=s,b(t),i=!0;break b}d===n(c)&&r(c),b(t)}else r(c);d=n(c)}if(d!==null)i=!0;else{var u=n(l);u!==null&&ne(x,u.startTime-t),i=!1}}break a}finally{d=null,f=a,p=!1}}}finally{i?D():S=!1}}}var D;if(typeof y==`function`)D=function(){y(ee)};else if(typeof MessageChannel<`u`){var O=new MessageChannel,te=O.port2;O.port1.onmessage=ee,D=function(){te.postMessage(null)}}else D=function(){_(ee,0)};function ne(t,n){C=_(function(){t(e.unstable_now())},n)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(e){e.callback=null},e.unstable_forceFrameRate=function(e){0>e||125<e?console.error(`forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported`):w=0<e?Math.floor(1e3/e):5},e.unstable_getCurrentPriorityLevel=function(){return f},e.unstable_next=function(e){switch(f){case 1:case 2:case 3:var t=3;break;default:t=f}var n=f;f=t;try{return e()}finally{f=n}},e.unstable_requestPaint=function(){g=!0},e.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=f;f=e;try{return t()}finally{f=n}},e.unstable_scheduleCallback=function(r,i,a){var o=e.unstable_now();switch(typeof a==`object`&&a?(a=a.delay,a=typeof a==`number`&&0<a?o+a:o):a=o,r){case 1:var s=-1;break;case 2:s=250;break;case 5:s=1073741823;break;case 4:s=1e4;break;default:s=5e3}return s=a+s,r={id:u++,callback:i,priorityLevel:r,startTime:a,expirationTime:s,sortIndex:-1},a>o?(r.sortIndex=a,t(l,r),n(c)===null&&r===n(l)&&(h?(v(C),C=-1):h=!0,ne(x,a-o))):(r.sortIndex=s,t(c,r),m||p||(m=!0,S||(S=!0,D()))),r},e.unstable_shouldYield=E,e.unstable_wrapCallback=function(e){var t=f;return function(){var n=f;f=t;try{return e.apply(this,arguments)}finally{f=n}}}})),p=o(((e,t)=>{t.exports=f()})),m=o((e=>{var t=d();function n(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function r(){}var i={d:{f:r,r:function(){throw Error(n(522))},D:r,C:r,L:r,m:r,X:r,S:r,M:r},p:0,findDOMNode:null},a=Symbol.for(`react.portal`);function o(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:a,key:r==null?null:``+r,children:e,containerInfo:t,implementation:n}}var s=t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function c(e,t){if(e===`font`)return``;if(typeof t==`string`)return t===`use-credentials`?t:``}e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=i,e.createPortal=function(e,t){var r=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(n(299));return o(e,t,null,r)},e.flushSync=function(e){var t=s.T,n=i.p;try{if(s.T=null,i.p=2,e)return e()}finally{s.T=t,i.p=n,i.d.f()}},e.preconnect=function(e,t){typeof e==`string`&&(t?(t=t.crossOrigin,t=typeof t==`string`?t===`use-credentials`?t:``:void 0):t=null,i.d.C(e,t))},e.prefetchDNS=function(e){typeof e==`string`&&i.d.D(e)},e.preinit=function(e,t){if(typeof e==`string`&&t&&typeof t.as==`string`){var n=t.as,r=c(n,t.crossOrigin),a=typeof t.integrity==`string`?t.integrity:void 0,o=typeof t.fetchPriority==`string`?t.fetchPriority:void 0;n===`style`?i.d.S(e,typeof t.precedence==`string`?t.precedence:void 0,{crossOrigin:r,integrity:a,fetchPriority:o}):n===`script`&&i.d.X(e,{crossOrigin:r,integrity:a,fetchPriority:o,nonce:typeof t.nonce==`string`?t.nonce:void 0})}},e.preinitModule=function(e,t){if(typeof e==`string`){if(typeof t==`object`&&t){if(t.as==null||t.as===`script`){var n=c(t.as,t.crossOrigin);i.d.M(e,{crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0})}}else t??i.d.M(e)}},e.preload=function(e,t){if(typeof e==`string`&&typeof t==`object`&&t&&typeof t.as==`string`){var n=t.as,r=c(n,t.crossOrigin);i.d.L(e,n,{crossOrigin:r,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0,type:typeof t.type==`string`?t.type:void 0,fetchPriority:typeof t.fetchPriority==`string`?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy==`string`?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet==`string`?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes==`string`?t.imageSizes:void 0,media:typeof t.media==`string`?t.media:void 0})}},e.preloadModule=function(e,t){if(typeof e==`string`){if(t){var n=c(t.as,t.crossOrigin);i.d.m(e,{as:typeof t.as==`string`&&t.as!==`script`?t.as:void 0,crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0})}else i.d.m(e)}},e.requestFormReset=function(e){i.d.r(e)},e.unstable_batchedUpdates=function(e,t){return e(t)},e.useFormState=function(e,t,n){return s.H.useFormState(e,t,n)},e.useFormStatus=function(){return s.H.useHostTransitionStatus()},e.version=`19.2.8`})),h=o(((e,t)=>{function n(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>`u`||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!=`function`))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=m()})),g=o((e=>{var t=p(),n=d(),r=h();function i(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function a(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function o(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function s(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function c(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function l(e){if(o(e)!==e)throw Error(i(188))}function u(e){var t=e.alternate;if(!t){if(t=o(e),t===null)throw Error(i(188));return t===e?e:null}for(var n=e,r=t;;){var a=n.return;if(a===null)break;var s=a.alternate;if(s===null){if(r=a.return,r!==null){n=r;continue}break}if(a.child===s.child){for(s=a.child;s;){if(s===n)return l(a),e;if(s===r)return l(a),t;s=s.sibling}throw Error(i(188))}if(n.return!==r.return)n=a,r=s;else{for(var c=!1,u=a.child;u;){if(u===n){c=!0,n=a,r=s;break}if(u===r){c=!0,r=a,n=s;break}u=u.sibling}if(!c){for(u=s.child;u;){if(u===n){c=!0,n=s,r=a;break}if(u===r){c=!0,r=s,n=a;break}u=u.sibling}if(!c)throw Error(i(189))}}if(n.alternate!==r)throw Error(i(190))}if(n.tag!==3)throw Error(i(188));return n.stateNode.current===n?e:t}function f(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=f(e),t!==null)return t;e=e.sibling}return null}var m=Object.assign,g=Symbol.for(`react.element`),_=Symbol.for(`react.transitional.element`),v=Symbol.for(`react.portal`),y=Symbol.for(`react.fragment`),b=Symbol.for(`react.strict_mode`),x=Symbol.for(`react.profiler`),S=Symbol.for(`react.consumer`),C=Symbol.for(`react.context`),w=Symbol.for(`react.forward_ref`),T=Symbol.for(`react.suspense`),E=Symbol.for(`react.suspense_list`),ee=Symbol.for(`react.memo`),D=Symbol.for(`react.lazy`),O=Symbol.for(`react.activity`),te=Symbol.for(`react.memo_cache_sentinel`),ne=Symbol.iterator;function re(e){return typeof e!=`object`||!e?null:(e=ne&&e[ne]||e[`@@iterator`],typeof e==`function`?e:null)}var ie=Symbol.for(`react.client.reference`);function ae(e){if(e==null)return null;if(typeof e==`function`)return e.$$typeof===ie?null:e.displayName||e.name||null;if(typeof e==`string`)return e;switch(e){case y:return`Fragment`;case x:return`Profiler`;case b:return`StrictMode`;case T:return`Suspense`;case E:return`SuspenseList`;case O:return`Activity`}if(typeof e==`object`)switch(e.$$typeof){case v:return`Portal`;case C:return e.displayName||`Context`;case S:return(e._context.displayName||`Context`)+`.Consumer`;case w:var t=e.render;return e=e.displayName,e||=(e=t.displayName||t.name||``,e===``?`ForwardRef`:`ForwardRef(`+e+`)`),e;case ee:return t=e.displayName||null,t===null?ae(e.type)||`Memo`:t;case D:t=e._payload,e=e._init;try{return ae(e(t))}catch{}}return null}var oe=Array.isArray,k=n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,A=r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,se={pending:!1,data:null,method:null,action:null},ce=[],le=-1;function ue(e){return{current:e}}function de(e){0>le||(e.current=ce[le],ce[le]=null,le--)}function fe(e,t){le++,ce[le]=e.current,e.current=t}var pe=ue(null),me=ue(null),he=ue(null),ge=ue(null);function _e(e,t){switch(fe(he,t),fe(me,e),fe(pe,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?Xd(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=Xd(t),e=Zd(t,e);else switch(e){case`svg`:e=1;break;case`math`:e=2;break;default:e=0}}de(pe),fe(pe,e)}function ve(){de(pe),de(me),de(he)}function ye(e){e.memoizedState!==null&&fe(ge,e);var t=pe.current,n=Zd(t,e.type);t!==n&&(fe(me,e),fe(pe,n))}function be(e){me.current===e&&(de(pe),de(me)),ge.current===e&&(de(ge),sp._currentValue=se)}var xe,Se;function Ce(e){if(xe===void 0)try{throw Error()}catch(e){var t=e.stack.trim().match(/\n( *(at )?)/);xe=t&&t[1]||``,Se=-1<e.stack.indexOf(`
    at`)?` (<anonymous>)`:-1<e.stack.indexOf(`@`)?`@unknown:0:0`:``}return`
`+xe+e+Se}var we=!1;function Te(e,t){if(!e||we)return``;we=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var r={DetermineComponentFrameRoot:function(){try{if(t){var n=function(){throw Error()};if(Object.defineProperty(n.prototype,"props",{set:function(){throw Error()}}),typeof Reflect==`object`&&Reflect.construct){try{Reflect.construct(n,[])}catch(e){var r=e}Reflect.construct(e,[],n)}else{try{n.call()}catch(e){r=e}e.call(n.prototype)}}else{try{throw Error()}catch(e){r=e}(n=e())&&typeof n.catch==`function`&&n.catch(function(){})}}catch(e){if(e&&r&&typeof e.stack==`string`)return[e.stack,r.stack]}return[null,null]}};r.DetermineComponentFrameRoot.displayName=`DetermineComponentFrameRoot`;var i=Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot,`name`);i&&i.configurable&&Object.defineProperty(r.DetermineComponentFrameRoot,"name",{value:`DetermineComponentFrameRoot`});var a=r.DetermineComponentFrameRoot(),o=a[0],s=a[1];if(o&&s){var c=o.split(`
`),l=s.split(`
`);for(i=r=0;r<c.length&&!c[r].includes(`DetermineComponentFrameRoot`);)r++;for(;i<l.length&&!l[i].includes(`DetermineComponentFrameRoot`);)i++;if(r===c.length||i===l.length)for(r=c.length-1,i=l.length-1;1<=r&&0<=i&&c[r]!==l[i];)i--;for(;1<=r&&0<=i;r--,i--)if(c[r]!==l[i]){if(r!==1||i!==1)do if(r--,i--,0>i||c[r]!==l[i]){var u=`
`+c[r].replace(` at new `,` at `);return e.displayName&&u.includes(`<anonymous>`)&&(u=u.replace(`<anonymous>`,e.displayName)),u}while(1<=r&&0<=i);break}}}finally{we=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:``)?Ce(n):``}function Ee(e,t){switch(e.tag){case 26:case 27:case 5:return Ce(e.type);case 16:return Ce(`Lazy`);case 13:return e.child!==t&&t!==null?Ce(`Suspense Fallback`):Ce(`Suspense`);case 19:return Ce(`SuspenseList`);case 0:case 15:return Te(e.type,!1);case 11:return Te(e.type.render,!1);case 1:return Te(e.type,!0);case 31:return Ce(`Activity`);default:return``}}function De(e){try{var t=``,n=null;do t+=Ee(e,n),n=e,e=e.return;while(e);return t}catch(e){return`
Error generating stack: `+e.message+`
`+e.stack}}var Oe=Object.prototype.hasOwnProperty,ke=t.unstable_scheduleCallback,Ae=t.unstable_cancelCallback,je=t.unstable_shouldYield,Me=t.unstable_requestPaint,Ne=t.unstable_now,Pe=t.unstable_getCurrentPriorityLevel,Fe=t.unstable_ImmediatePriority,Ie=t.unstable_UserBlockingPriority,Le=t.unstable_NormalPriority,Re=t.unstable_LowPriority,ze=t.unstable_IdlePriority,Be=t.log,Ve=t.unstable_setDisableYieldValue,He=null,Ue=null;function We(e){if(typeof Be==`function`&&Ve(e),Ue&&typeof Ue.setStrictMode==`function`)try{Ue.setStrictMode(He,e)}catch{}}var Ge=Math.clz32?Math.clz32:Je,Ke=Math.log,qe=Math.LN2;function Je(e){return e>>>=0,e===0?32:31-(Ke(e)/qe|0)|0}var Ye=256,Xe=262144,Ze=4194304;function Qe(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&261888;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function $e(e,t,n){var r=e.pendingLanes;if(r===0)return 0;var i=0,a=e.suspendedLanes,o=e.pingedLanes;e=e.warmLanes;var s=r&134217727;return s===0?(s=r&~a,s===0?o===0?n||(n=r&~e,n!==0&&(i=Qe(n))):i=Qe(o):i=Qe(s)):(r=s&~a,r===0?(o&=s,o===0?n||(n=s&~e,n!==0&&(i=Qe(n))):i=Qe(o)):i=Qe(r)),i===0?0:t!==0&&t!==i&&(t&a)===0&&(a=i&-i,n=t&-t,a>=n||a===32&&n&4194048)?t:i}function et(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function tt(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function nt(){var e=Ze;return Ze<<=1,!(Ze&62914560)&&(Ze=4194304),e}function rt(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function it(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function at(e,t,n,r,i,a){var o=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var s=e.entanglements,c=e.expirationTimes,l=e.hiddenUpdates;for(n=o&~n;0<n;){var u=31-Ge(n),d=1<<u;s[u]=0,c[u]=-1;var f=l[u];if(f!==null)for(l[u]=null,u=0;u<f.length;u++){var p=f[u];p!==null&&(p.lane&=-536870913)}n&=~d}r!==0&&ot(e,r,0),a!==0&&i===0&&e.tag!==0&&(e.suspendedLanes|=a&~(o&~t))}function ot(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var r=31-Ge(t);e.entangledLanes|=t,e.entanglements[r]=e.entanglements[r]|1073741824|n&261930}function st(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Ge(n),i=1<<r;i&t|e[r]&t&&(e[r]|=t),n&=~i}}function ct(e,t){var n=t&-t;return n=n&42?1:lt(n),(n&(e.suspendedLanes|t))===0?n:0}function lt(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function ut(e){return e&=-e,2<e?8<e?e&134217727?32:268435456:8:2}function dt(){var e=A.p;return e===0?(e=window.event,e===void 0?32:Cp(e.type)):e}function ft(e,t){var n=A.p;try{return A.p=e,t()}finally{A.p=n}}var pt=Math.random().toString(36).slice(2),mt=`__reactFiber$`+pt,ht=`__reactProps$`+pt,gt=`__reactContainer$`+pt,_t=`__reactEvents$`+pt,vt=`__reactListeners$`+pt,yt=`__reactHandles$`+pt,bt=`__reactResources$`+pt,xt=`__reactMarker$`+pt;function St(e){delete e[mt],delete e[ht],delete e[_t],delete e[vt],delete e[yt]}function Ct(e){var t=e[mt];if(t)return t;for(var n=e.parentNode;n;){if(t=n[gt]||n[mt]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=bf(e);e!==null;){if(n=e[mt])return n;e=bf(e)}return t}e=n,n=e.parentNode}return null}function wt(e){if(e=e[mt]||e[gt]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function Tt(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(i(33))}function Et(e){var t=e[bt];return t||=e[bt]={hoistableStyles:new Map,hoistableScripts:new Map},t}function Dt(e){e[xt]=!0}var Ot=new Set,kt={};function At(e,t){jt(e,t),jt(e+`Capture`,t)}function jt(e,t){for(kt[e]=t,e=0;e<t.length;e++)Ot.add(t[e])}var Mt=RegExp(`^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`),Nt={},Pt={};function Ft(e){return Oe.call(Pt,e)?!0:Oe.call(Nt,e)?!1:Mt.test(e)?Pt[e]=!0:(Nt[e]=!0,!1)}function It(e,t,n){if(Ft(t)){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:e.removeAttribute(t);return;case`boolean`:var r=t.toLowerCase().slice(0,5);if(r!==`data-`&&r!==`aria-`){e.removeAttribute(t);return}}e.setAttribute(t,``+n)}}}function Lt(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(t);return}e.setAttribute(t,``+n)}}function Rt(e,t,n,r){if(r===null)e.removeAttribute(n);else{switch(typeof r){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(n);return}e.setAttributeNS(t,n,``+r)}}function zt(e){switch(typeof e){case`bigint`:case`boolean`:case`number`:case`string`:case`undefined`:return e;case`object`:return e;default:return``}}function Bt(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()===`input`&&(t===`checkbox`||t===`radio`)}function Vt(e,t,n){var r=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&r!==void 0&&typeof r.get==`function`&&typeof r.set==`function`){var i=r.get,a=r.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return i.call(this)},set:function(e){n=``+e,a.call(this,e)}}),Object.defineProperty(e,t,{enumerable:r.enumerable}),{getValue:function(){return n},setValue:function(e){n=``+e},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Ht(e){if(!e._valueTracker){var t=Bt(e)?`checked`:`value`;e._valueTracker=Vt(e,t,``+e[t])}}function Ut(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r=``;return e&&(r=Bt(e)?e.checked?`true`:`false`:e.value),e=r,e!==n&&(t.setValue(e),!0)}function Wt(e){if(e||=typeof document<`u`?document:void 0,e===void 0)return null;try{return e.activeElement||e.body}catch{return e.body}}var Gt=/[\n"\\]/g;function Kt(e){return e.replace(Gt,function(e){return`\\`+e.charCodeAt(0).toString(16)+` `})}function qt(e,t,n,r,i,a,o,s){e.name=``,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`?e.type=o:e.removeAttribute(`type`),t==null?o!==`submit`&&o!==`reset`||e.removeAttribute(`value`):o===`number`?(t===0&&e.value===``||e.value!=t)&&(e.value=``+zt(t)):e.value!==``+zt(t)&&(e.value=``+zt(t)),t==null?n==null?r!=null&&e.removeAttribute(`value`):Yt(e,o,zt(n)):Yt(e,o,zt(t)),i==null&&a!=null&&(e.defaultChecked=!!a),i!=null&&(e.checked=i&&typeof i!=`function`&&typeof i!=`symbol`),s!=null&&typeof s!=`function`&&typeof s!=`symbol`&&typeof s!=`boolean`?e.name=``+zt(s):e.removeAttribute(`name`)}function Jt(e,t,n,r,i,a,o,s){if(a!=null&&typeof a!=`function`&&typeof a!=`symbol`&&typeof a!=`boolean`&&(e.type=a),t!=null||n!=null){if(!(a!==`submit`&&a!==`reset`||t!=null)){Ht(e);return}n=n==null?``:``+zt(n),t=t==null?n:``+zt(t),s||t===e.value||(e.value=t),e.defaultValue=t}r??=i,r=typeof r!=`function`&&typeof r!=`symbol`&&!!r,e.checked=s?e.checked:!!r,e.defaultChecked=!!r,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`&&(e.name=o),Ht(e)}function Yt(e,t,n){t===`number`&&Wt(e.ownerDocument)===e||e.defaultValue===``+n||(e.defaultValue=``+n)}function Xt(e,t,n,r){if(e=e.options,t){t={};for(var i=0;i<n.length;i++)t[`$`+n[i]]=!0;for(n=0;n<e.length;n++)i=t.hasOwnProperty(`$`+e[n].value),e[n].selected!==i&&(e[n].selected=i),i&&r&&(e[n].defaultSelected=!0)}else{for(n=``+zt(n),t=null,i=0;i<e.length;i++){if(e[i].value===n){e[i].selected=!0,r&&(e[i].defaultSelected=!0);return}t!==null||e[i].disabled||(t=e[i])}t!==null&&(t.selected=!0)}}function Zt(e,t,n){if(t!=null&&(t=``+zt(t),t!==e.value&&(e.value=t),n==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=n==null?``:``+zt(n)}function Qt(e,t,n,r){if(t==null){if(r!=null){if(n!=null)throw Error(i(92));if(oe(r)){if(1<r.length)throw Error(i(93));r=r[0]}n=r}n??=``,t=n}n=zt(t),e.defaultValue=n,r=e.textContent,r===n&&r!==``&&r!==null&&(e.value=r),Ht(e)}function $t(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var en=new Set(`animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp`.split(` `));function tn(e,t,n){var r=t.indexOf(`--`)===0;n==null||typeof n==`boolean`||n===``?r?e.setProperty(t,``):t===`float`?e.cssFloat=``:e[t]=``:r?e.setProperty(t,n):typeof n!=`number`||n===0||en.has(t)?t===`float`?e.cssFloat=n:e[t]=(``+n).trim():e[t]=n+`px`}function nn(e,t,n){if(t!=null&&typeof t!=`object`)throw Error(i(62));if(e=e.style,n!=null){for(var r in n)!n.hasOwnProperty(r)||t!=null&&t.hasOwnProperty(r)||(r.indexOf(`--`)===0?e.setProperty(r,``):r===`float`?e.cssFloat=``:e[r]=``);for(var a in t)r=t[a],t.hasOwnProperty(a)&&n[a]!==r&&tn(e,a,r)}else for(var o in t)t.hasOwnProperty(o)&&tn(e,o,t[o])}function rn(e){if(e.indexOf(`-`)===-1)return!1;switch(e){case`annotation-xml`:case`color-profile`:case`font-face`:case`font-face-src`:case`font-face-uri`:case`font-face-format`:case`font-face-name`:case`missing-glyph`:return!1;default:return!0}}var an=new Map([[`acceptCharset`,`accept-charset`],[`htmlFor`,`for`],[`httpEquiv`,`http-equiv`],[`crossOrigin`,`crossorigin`],[`accentHeight`,`accent-height`],[`alignmentBaseline`,`alignment-baseline`],[`arabicForm`,`arabic-form`],[`baselineShift`,`baseline-shift`],[`capHeight`,`cap-height`],[`clipPath`,`clip-path`],[`clipRule`,`clip-rule`],[`colorInterpolation`,`color-interpolation`],[`colorInterpolationFilters`,`color-interpolation-filters`],[`colorProfile`,`color-profile`],[`colorRendering`,`color-rendering`],[`dominantBaseline`,`dominant-baseline`],[`enableBackground`,`enable-background`],[`fillOpacity`,`fill-opacity`],[`fillRule`,`fill-rule`],[`floodColor`,`flood-color`],[`floodOpacity`,`flood-opacity`],[`fontFamily`,`font-family`],[`fontSize`,`font-size`],[`fontSizeAdjust`,`font-size-adjust`],[`fontStretch`,`font-stretch`],[`fontStyle`,`font-style`],[`fontVariant`,`font-variant`],[`fontWeight`,`font-weight`],[`glyphName`,`glyph-name`],[`glyphOrientationHorizontal`,`glyph-orientation-horizontal`],[`glyphOrientationVertical`,`glyph-orientation-vertical`],[`horizAdvX`,`horiz-adv-x`],[`horizOriginX`,`horiz-origin-x`],[`imageRendering`,`image-rendering`],[`letterSpacing`,`letter-spacing`],[`lightingColor`,`lighting-color`],[`markerEnd`,`marker-end`],[`markerMid`,`marker-mid`],[`markerStart`,`marker-start`],[`overlinePosition`,`overline-position`],[`overlineThickness`,`overline-thickness`],[`paintOrder`,`paint-order`],[`panose-1`,`panose-1`],[`pointerEvents`,`pointer-events`],[`renderingIntent`,`rendering-intent`],[`shapeRendering`,`shape-rendering`],[`stopColor`,`stop-color`],[`stopOpacity`,`stop-opacity`],[`strikethroughPosition`,`strikethrough-position`],[`strikethroughThickness`,`strikethrough-thickness`],[`strokeDasharray`,`stroke-dasharray`],[`strokeDashoffset`,`stroke-dashoffset`],[`strokeLinecap`,`stroke-linecap`],[`strokeLinejoin`,`stroke-linejoin`],[`strokeMiterlimit`,`stroke-miterlimit`],[`strokeOpacity`,`stroke-opacity`],[`strokeWidth`,`stroke-width`],[`textAnchor`,`text-anchor`],[`textDecoration`,`text-decoration`],[`textRendering`,`text-rendering`],[`transformOrigin`,`transform-origin`],[`underlinePosition`,`underline-position`],[`underlineThickness`,`underline-thickness`],[`unicodeBidi`,`unicode-bidi`],[`unicodeRange`,`unicode-range`],[`unitsPerEm`,`units-per-em`],[`vAlphabetic`,`v-alphabetic`],[`vHanging`,`v-hanging`],[`vIdeographic`,`v-ideographic`],[`vMathematical`,`v-mathematical`],[`vectorEffect`,`vector-effect`],[`vertAdvY`,`vert-adv-y`],[`vertOriginX`,`vert-origin-x`],[`vertOriginY`,`vert-origin-y`],[`wordSpacing`,`word-spacing`],[`writingMode`,`writing-mode`],[`xmlnsXlink`,`xmlns:xlink`],[`xHeight`,`x-height`]]),on=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function sn(e){return on.test(``+e)?`javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`:e}function cn(){}var ln=null;function un(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var dn=null,fn=null;function pn(e){var t=wt(e);if(t&&(e=t.stateNode)){var n=e[ht]||null;a:switch(e=t.stateNode,t.type){case`input`:if(qt(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type===`radio`&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll(`input[name="`+Kt(``+t)+`"][type="radio"]`),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var a=r[ht]||null;if(!a)throw Error(i(90));qt(r,a.value,a.defaultValue,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name)}}for(t=0;t<n.length;t++)r=n[t],r.form===e.form&&Ut(r)}break a;case`textarea`:Zt(e,n.value,n.defaultValue);break a;case`select`:t=n.value,t!=null&&Xt(e,!!n.multiple,t,!1)}}}var mn=!1;function hn(e,t,n){if(mn)return e(t,n);mn=!0;try{return e(t)}finally{if(mn=!1,(dn!==null||fn!==null)&&(Du(),dn&&(t=dn,e=fn,fn=dn=null,pn(t),e)))for(t=0;t<e.length;t++)pn(e[t])}}function gn(e,t){var n=e.stateNode;if(n===null)return null;var r=n[ht]||null;if(r===null)return null;n=r[t];a:switch(t){case`onClick`:case`onClickCapture`:case`onDoubleClick`:case`onDoubleClickCapture`:case`onMouseDown`:case`onMouseDownCapture`:case`onMouseMove`:case`onMouseMoveCapture`:case`onMouseUp`:case`onMouseUpCapture`:case`onMouseEnter`:(r=!r.disabled)||(e=e.type,r=e!==`button`&&e!==`input`&&e!==`select`&&e!==`textarea`),e=!r;break a;default:e=!1}if(e)return null;if(n&&typeof n!=`function`)throw Error(i(231,t,typeof n));return n}var _n=!(typeof window>`u`||window.document===void 0||window.document.createElement===void 0),vn=!1;if(_n)try{var yn={};Object.defineProperty(yn,"passive",{get:function(){vn=!0}}),window.addEventListener(`test`,yn,yn),window.removeEventListener(`test`,yn,yn)}catch{vn=!1}var bn=null,xn=null,Sn=null;function Cn(){if(Sn)return Sn;var e,t=xn,n=t.length,r,i=`value`in bn?bn.value:bn.textContent,a=i.length;for(e=0;e<n&&t[e]===i[e];e++);var o=n-e;for(r=1;r<=o&&t[n-r]===i[a-r];r++);return Sn=i.slice(e,1<r?1-r:void 0)}function wn(e){var t=e.keyCode;return`charCode`in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Tn(){return!0}function En(){return!1}function Dn(e){function t(t,n,r,i,a){for(var o in this._reactName=t,this._targetInst=r,this.type=n,this.nativeEvent=i,this.target=a,this.currentTarget=null,e)e.hasOwnProperty(o)&&(t=e[o],this[o]=t?t(i):i[o]);return this.isDefaultPrevented=(i.defaultPrevented==null?!1===i.returnValue:i.defaultPrevented)?Tn:En,this.isPropagationStopped=En,this}return m(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var e=this.nativeEvent;e&&(e.preventDefault?e.preventDefault():typeof e.returnValue!=`unknown`&&(e.returnValue=!1),this.isDefaultPrevented=Tn)},stopPropagation:function(){var e=this.nativeEvent;e&&(e.stopPropagation?e.stopPropagation():typeof e.cancelBubble!=`unknown`&&(e.cancelBubble=!0),this.isPropagationStopped=Tn)},persist:function(){},isPersistent:Tn}),t}var On={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},kn=Dn(On),An=m({},On,{view:0,detail:0}),jn=Dn(An),Mn,Nn,Pn,Fn=m({},An,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Gn,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return`movementX`in e?e.movementX:(e!==Pn&&(Pn&&e.type===`mousemove`?(Mn=e.screenX-Pn.screenX,Nn=e.screenY-Pn.screenY):Nn=Mn=0,Pn=e),Mn)},movementY:function(e){return`movementY`in e?e.movementY:Nn}}),In=Dn(Fn),Ln=Dn(m({},Fn,{dataTransfer:0})),Rn=Dn(m({},An,{relatedTarget:0})),zn=Dn(m({},On,{animationName:0,elapsedTime:0,pseudoElement:0})),Bn=Dn(m({},On,{clipboardData:function(e){return`clipboardData`in e?e.clipboardData:window.clipboardData}})),Vn=Dn(m({},On,{data:0})),Hn={Esc:`Escape`,Spacebar:` `,Left:`ArrowLeft`,Up:`ArrowUp`,Right:`ArrowRight`,Down:`ArrowDown`,Del:`Delete`,Win:`OS`,Menu:`ContextMenu`,Apps:`ContextMenu`,Scroll:`ScrollLock`,MozPrintableKey:`Unidentified`},j={8:`Backspace`,9:`Tab`,12:`Clear`,13:`Enter`,16:`Shift`,17:`Control`,18:`Alt`,19:`Pause`,20:`CapsLock`,27:`Escape`,32:` `,33:`PageUp`,34:`PageDown`,35:`End`,36:`Home`,37:`ArrowLeft`,38:`ArrowUp`,39:`ArrowRight`,40:`ArrowDown`,45:`Insert`,46:`Delete`,112:`F1`,113:`F2`,114:`F3`,115:`F4`,116:`F5`,117:`F6`,118:`F7`,119:`F8`,120:`F9`,121:`F10`,122:`F11`,123:`F12`,144:`NumLock`,145:`ScrollLock`,224:`Meta`},Un={Alt:`altKey`,Control:`ctrlKey`,Meta:`metaKey`,Shift:`shiftKey`};function Wn(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Un[e])?!!t[e]:!1}function Gn(){return Wn}var Kn=Dn(m({},An,{key:function(e){if(e.key){var t=Hn[e.key]||e.key;if(t!==`Unidentified`)return t}return e.type===`keypress`?(e=wn(e),e===13?`Enter`:String.fromCharCode(e)):e.type===`keydown`||e.type===`keyup`?j[e.keyCode]||`Unidentified`:``},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Gn,charCode:function(e){return e.type===`keypress`?wn(e):0},keyCode:function(e){return e.type===`keydown`||e.type===`keyup`?e.keyCode:0},which:function(e){return e.type===`keypress`?wn(e):e.type===`keydown`||e.type===`keyup`?e.keyCode:0}})),qn=Dn(m({},Fn,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0})),Jn=Dn(m({},An,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Gn})),Yn=Dn(m({},On,{propertyName:0,elapsedTime:0,pseudoElement:0})),Xn=Dn(m({},Fn,{deltaX:function(e){return`deltaX`in e?e.deltaX:`wheelDeltaX`in e?-e.wheelDeltaX:0},deltaY:function(e){return`deltaY`in e?e.deltaY:`wheelDeltaY`in e?-e.wheelDeltaY:`wheelDelta`in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0})),Zn=Dn(m({},On,{newState:0,oldState:0})),Qn=[9,13,27,32],$n=_n&&`CompositionEvent`in window,er=null;_n&&`documentMode`in document&&(er=document.documentMode);var tr=_n&&`TextEvent`in window&&!er,nr=_n&&(!$n||er&&8<er&&11>=er),rr=` `,ir=!1;function ar(e,t){switch(e){case`keyup`:return Qn.indexOf(t.keyCode)!==-1;case`keydown`:return t.keyCode!==229;case`keypress`:case`mousedown`:case`focusout`:return!0;default:return!1}}function or(e){return e=e.detail,typeof e==`object`&&`data`in e?e.data:null}var sr=!1;function cr(e,t){switch(e){case`compositionend`:return or(t);case`keypress`:return t.which===32?(ir=!0,rr):null;case`textInput`:return e=t.data,e===rr&&ir?null:e;default:return null}}function lr(e,t){if(sr)return e===`compositionend`||!$n&&ar(e,t)?(e=Cn(),Sn=xn=bn=null,sr=!1,e):null;switch(e){case`paste`:return null;case`keypress`:if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case`compositionend`:return nr&&t.locale!==`ko`?null:t.data;default:return null}}var ur={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function dr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t===`input`?!!ur[e.type]:t===`textarea`}function fr(e,t,n,r){dn?fn?fn.push(r):fn=[r]:dn=r,t=Pd(t,`onChange`),0<t.length&&(n=new kn(`onChange`,`change`,null,n,r),e.push({event:n,listeners:t}))}var pr=null,mr=null;function hr(e){Dd(e,0)}function gr(e){if(Ut(Tt(e)))return e}function _r(e,t){if(e===`change`)return t}var vr=!1;if(_n){var yr;if(_n){var br=`oninput`in document;if(!br){var xr=document.createElement(`div`);xr.setAttribute(`oninput`,`return;`),br=typeof xr.oninput==`function`}yr=br}else yr=!1;vr=yr&&(!document.documentMode||9<document.documentMode)}function Sr(){pr&&(pr.detachEvent(`onpropertychange`,Cr),mr=pr=null)}function Cr(e){if(e.propertyName===`value`&&gr(mr)){var t=[];fr(t,mr,e,un(e)),hn(hr,t)}}function wr(e,t,n){e===`focusin`?(Sr(),pr=t,mr=n,pr.attachEvent(`onpropertychange`,Cr)):e===`focusout`&&Sr()}function Tr(e){if(e===`selectionchange`||e===`keyup`||e===`keydown`)return gr(mr)}function Er(e,t){if(e===`click`)return gr(t)}function Dr(e,t){if(e===`input`||e===`change`)return gr(t)}function Or(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var kr=typeof Object.is==`function`?Object.is:Or;function Ar(e,t){if(kr(e,t))return!0;if(typeof e!=`object`||!e||typeof t!=`object`||!t)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var i=n[r];if(!Oe.call(t,i)||!kr(e[i],t[i]))return!1}return!0}function jr(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Mr(e,t){var n=jr(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}a:{for(;n;){if(n.nextSibling){n=n.nextSibling;break a}n=n.parentNode}n=void 0}n=jr(n)}}function Nr(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Nr(e,t.parentNode):`contains`in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Pr(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=Wt(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href==`string`}catch{n=!1}if(n)e=t.contentWindow;else break;t=Wt(e.document)}return t}function Fr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t===`input`&&(e.type===`text`||e.type===`search`||e.type===`tel`||e.type===`url`||e.type===`password`)||t===`textarea`||e.contentEditable===`true`)}var Ir=_n&&`documentMode`in document&&11>=document.documentMode,Lr=null,Rr=null,zr=null,Br=!1;function Vr(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Br||Lr==null||Lr!==Wt(r)||(r=Lr,`selectionStart`in r&&Fr(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),zr&&Ar(zr,r)||(zr=r,r=Pd(Rr,`onSelect`),0<r.length&&(t=new kn(`onSelect`,`select`,null,t,n),e.push({event:t,listeners:r}),t.target=Lr)))}function Hr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n[`Webkit`+e]=`webkit`+t,n[`Moz`+e]=`moz`+t,n}var Ur={animationend:Hr(`Animation`,`AnimationEnd`),animationiteration:Hr(`Animation`,`AnimationIteration`),animationstart:Hr(`Animation`,`AnimationStart`),transitionrun:Hr(`Transition`,`TransitionRun`),transitionstart:Hr(`Transition`,`TransitionStart`),transitioncancel:Hr(`Transition`,`TransitionCancel`),transitionend:Hr(`Transition`,`TransitionEnd`)},Wr={},Gr={};_n&&(Gr=document.createElement(`div`).style,`AnimationEvent`in window||(delete Ur.animationend.animation,delete Ur.animationiteration.animation,delete Ur.animationstart.animation),`TransitionEvent`in window||delete Ur.transitionend.transition);function Kr(e){if(Wr[e])return Wr[e];if(!Ur[e])return e;var t=Ur[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Gr)return Wr[e]=t[n];return e}var qr=Kr(`animationend`),Jr=Kr(`animationiteration`),Yr=Kr(`animationstart`),Xr=Kr(`transitionrun`),Zr=Kr(`transitionstart`),Qr=Kr(`transitioncancel`),$r=Kr(`transitionend`),ei=new Map,ti=`abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel`.split(` `);ti.push(`scrollEnd`);function ni(e,t){ei.set(e,t),At(t,[e])}var ri=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},ii=[],ai=0,oi=0;function si(){for(var e=ai,t=oi=ai=0;t<e;){var n=ii[t];ii[t++]=null;var r=ii[t];ii[t++]=null;var i=ii[t];ii[t++]=null;var a=ii[t];if(ii[t++]=null,r!==null&&i!==null){var o=r.pending;o===null?i.next=i:(i.next=o.next,o.next=i),r.pending=i}a!==0&&di(n,i,a)}}function ci(e,t,n,r){ii[ai++]=e,ii[ai++]=t,ii[ai++]=n,ii[ai++]=r,oi|=r,e.lanes|=r,e=e.alternate,e!==null&&(e.lanes|=r)}function li(e,t,n,r){return ci(e,t,n,r),fi(e)}function ui(e,t){return ci(e,null,null,t),fi(e)}function di(e,t,n){e.lanes|=n;var r=e.alternate;r!==null&&(r.lanes|=n);for(var i=!1,a=e.return;a!==null;)a.childLanes|=n,r=a.alternate,r!==null&&(r.childLanes|=n),a.tag===22&&(e=a.stateNode,e===null||e._visibility&1||(i=!0)),e=a,a=a.return;return e.tag===3?(a=e.stateNode,i&&t!==null&&(i=31-Ge(n),e=a.hiddenUpdates,r=e[i],r===null?e[i]=[t]:r.push(t),t.lane=n|536870912),a):null}function fi(e){if(50<vu)throw vu=0,yu=null,Error(i(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var pi={};function mi(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function hi(e,t,n,r){return new mi(e,t,n,r)}function gi(e){return e=e.prototype,!(!e||!e.isReactComponent)}function _i(e,t){var n=e.alternate;return n===null?(n=hi(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&65011712,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function vi(e,t){e.flags&=65011714;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function yi(e,t,n,r,a,o){var s=0;if(r=e,typeof e==`function`)gi(e)&&(s=1);else if(typeof e==`string`)s=Qf(e,n,pe.current)?26:e===`html`||e===`head`||e===`body`?27:5;else a:switch(e){case O:return e=hi(31,n,t,a),e.elementType=O,e.lanes=o,e;case y:return bi(n.children,a,o,t);case b:s=8,a|=24;break;case x:return e=hi(12,n,t,a|2),e.elementType=x,e.lanes=o,e;case T:return e=hi(13,n,t,a),e.elementType=T,e.lanes=o,e;case E:return e=hi(19,n,t,a),e.elementType=E,e.lanes=o,e;default:if(typeof e==`object`&&e)switch(e.$$typeof){case C:s=10;break a;case S:s=9;break a;case w:s=11;break a;case ee:s=14;break a;case D:s=16,r=null;break a}s=29,n=Error(i(130,e===null?`null`:typeof e,``)),r=null}return t=hi(s,n,t,a),t.elementType=e,t.type=r,t.lanes=o,t}function bi(e,t,n,r){return e=hi(7,e,r,t),e.lanes=n,e}function xi(e,t,n){return e=hi(6,e,null,t),e.lanes=n,e}function Si(e){var t=hi(18,null,null,0);return t.stateNode=e,t}function Ci(e,t,n){return t=hi(4,e.children===null?[]:e.children,e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var wi=new WeakMap;function Ti(e,t){if(typeof e==`object`&&e){var n=wi.get(e);return n===void 0?(t={value:e,source:t,stack:De(t)},wi.set(e,t),t):n}return{value:e,source:t,stack:De(t)}}var Ei=[],Di=0,Oi=null,ki=0,Ai=[],ji=0,Mi=null,Ni=1,Pi=``;function Fi(e,t){Ei[Di++]=ki,Ei[Di++]=Oi,Oi=e,ki=t}function Ii(e,t,n){Ai[ji++]=Ni,Ai[ji++]=Pi,Ai[ji++]=Mi,Mi=e;var r=Ni;e=Pi;var i=32-Ge(r)-1;r&=~(1<<i),n+=1;var a=32-Ge(t)+i;if(30<a){var o=i-i%5;a=(r&(1<<o)-1).toString(32),r>>=o,i-=o,Ni=1<<32-Ge(t)+i|n<<i|r,Pi=a+e}else Ni=1<<a|n<<i|r,Pi=e}function Li(e){e.return!==null&&(Fi(e,1),Ii(e,1,0))}function Ri(e){for(;e===Oi;)Oi=Ei[--Di],Ei[Di]=null,ki=Ei[--Di],Ei[Di]=null;for(;e===Mi;)Mi=Ai[--ji],Ai[ji]=null,Pi=Ai[--ji],Ai[ji]=null,Ni=Ai[--ji],Ai[ji]=null}function zi(e,t){Ai[ji++]=Ni,Ai[ji++]=Pi,Ai[ji++]=Mi,Ni=t.id,Pi=t.overflow,Mi=e}var Bi=null,Vi=null,M=!1,Hi=null,Ui=!1,Wi=Error(i(519));function Gi(e){throw Zi(Ti(Error(i(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?`text`:`HTML`,``)),e)),Wi}function Ki(e){var t=e.stateNode,n=e.type,r=e.memoizedProps;switch(t[mt]=e,t[ht]=r,n){case`dialog`:W(`cancel`,t),W(`close`,t);break;case`iframe`:case`object`:case`embed`:W(`load`,t);break;case`video`:case`audio`:for(n=0;n<Td.length;n++)W(Td[n],t);break;case`source`:W(`error`,t);break;case`img`:case`image`:case`link`:W(`error`,t),W(`load`,t);break;case`details`:W(`toggle`,t);break;case`input`:W(`invalid`,t),Jt(t,r.value,r.defaultValue,r.checked,r.defaultChecked,r.type,r.name,!0);break;case`select`:W(`invalid`,t);break;case`textarea`:W(`invalid`,t),Qt(t,r.value,r.defaultValue,r.children)}n=r.children,typeof n!=`string`&&typeof n!=`number`&&typeof n!=`bigint`||t.textContent===``+n||!0===r.suppressHydrationWarning||Bd(t.textContent,n)?(r.popover!=null&&(W(`beforetoggle`,t),W(`toggle`,t)),r.onScroll!=null&&W(`scroll`,t),r.onScrollEnd!=null&&W(`scrollend`,t),r.onClick!=null&&(t.onclick=cn),t=!0):t=!1,t||Gi(e,!0)}function qi(e){for(Bi=e.return;Bi;)switch(Bi.tag){case 5:case 31:case 13:Ui=!1;return;case 27:case 3:Ui=!0;return;default:Bi=Bi.return}}function Ji(e){if(e!==Bi)return!1;if(!M)return qi(e),M=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=n===`form`||n===`button`||Qd(e.type,e.memoizedProps)),n=!n),n&&Vi&&Gi(e),qi(e),t===13){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(317));Vi=yf(e)}else if(t===31){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(317));Vi=yf(e)}else t===27?(t=Vi,sf(e.type)?(e=vf,vf=null,Vi=e):Vi=t):Vi=Bi?_f(e.stateNode.nextSibling):null;return!0}function Yi(){Vi=Bi=null,M=!1}function Xi(){var e=Hi;return e!==null&&(iu===null?iu=e:iu.push.apply(iu,e),Hi=null),e}function Zi(e){Hi===null?Hi=[e]:Hi.push(e)}var Qi=ue(null),$i=null,ea=null;function ta(e,t,n){fe(Qi,t._currentValue),t._currentValue=n}function na(e){e._currentValue=Qi.current,de(Qi)}function ra(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)===t?r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t):(e.childLanes|=t,r!==null&&(r.childLanes|=t)),e===n)break;e=e.return}}function ia(e,t,n,r){var a=e.child;for(a!==null&&(a.return=e);a!==null;){var o=a.dependencies;if(o!==null){var s=a.child;o=o.firstContext;a:for(;o!==null;){var c=o;o=a;for(var l=0;l<t.length;l++)if(c.context===t[l]){o.lanes|=n,c=o.alternate,c!==null&&(c.lanes|=n),ra(o.return,n,e),r||(s=null);break a}o=c.next}}else if(a.tag===18){if(s=a.return,s===null)throw Error(i(341));s.lanes|=n,o=s.alternate,o!==null&&(o.lanes|=n),ra(s,n,e),s=null}else s=a.child;if(s!==null)s.return=a;else for(s=a;s!==null;){if(s===e){s=null;break}if(a=s.sibling,a!==null){a.return=s.return,s=a;break}s=s.return}a=s}}function aa(e,t,n,r){e=null;for(var a=t,o=!1;a!==null;){if(!o){if(a.flags&524288)o=!0;else if(a.flags&262144)break}if(a.tag===10){var s=a.alternate;if(s===null)throw Error(i(387));if(s=s.memoizedProps,s!==null){var c=a.type;kr(a.pendingProps.value,s.value)||(e===null?e=[c]:e.push(c))}}else if(a===ge.current){if(s=a.alternate,s===null)throw Error(i(387));s.memoizedState.memoizedState!==a.memoizedState.memoizedState&&(e===null?e=[sp]:e.push(sp))}a=a.return}e!==null&&ia(t,e,n,r),t.flags|=262144}function oa(e){for(e=e.firstContext;e!==null;){if(!kr(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function sa(e){$i=e,ea=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function ca(e){return ua($i,e)}function la(e,t){return $i===null&&sa(e),ua(e,t)}function ua(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},ea===null){if(e===null)throw Error(i(308));ea=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else ea=ea.next=t;return n}var da=typeof AbortController<`u`?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(t,n){e.push(n)}};this.abort=function(){t.aborted=!0,e.forEach(function(e){return e()})}},fa=t.unstable_scheduleCallback,pa=t.unstable_NormalPriority,ma={$$typeof:C,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function ha(){return{controller:new da,data:new Map,refCount:0}}function ga(e){e.refCount--,e.refCount===0&&fa(pa,function(){e.controller.abort()})}var _a=null,va=0,ya=0,ba=null;function xa(e,t){if(_a===null){var n=_a=[];va=0,ya=yd(),ba={status:`pending`,value:void 0,then:function(e){n.push(e)}}}return va++,t.then(Sa,Sa),t}function Sa(){if(--va===0&&_a!==null){ba!==null&&(ba.status=`fulfilled`);var e=_a;_a=null,ya=0,ba=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function Ca(e,t){var n=[],r={status:`pending`,value:null,reason:null,then:function(e){n.push(e)}};return e.then(function(){r.status=`fulfilled`,r.value=t;for(var e=0;e<n.length;e++)(0,n[e])(t)},function(e){for(r.status=`rejected`,r.reason=e,e=0;e<n.length;e++)(0,n[e])(void 0)}),r}var wa=k.S;k.S=function(e,t){su=Ne(),typeof t==`object`&&t&&typeof t.then==`function`&&xa(e,t),wa!==null&&wa(e,t)};var Ta=ue(null);function Ea(){var e=Ta.current;return e===null?Wl.pooledCache:e}function Da(e,t){t===null?fe(Ta,Ta.current):fe(Ta,t.pool)}function Oa(){var e=Ea();return e===null?null:{parent:ma._currentValue,pool:e}}var ka=Error(i(460)),Aa=Error(i(474)),ja=Error(i(542)),Ma={then:function(){}};function Na(e){return e=e.status,e===`fulfilled`||e===`rejected`}function Pa(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(cn,cn),t=n),t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,Ra(e),e;default:if(typeof t.status==`string`)t.then(cn,cn);else{if(e=Wl,e!==null&&100<e.shellSuspendCounter)throw Error(i(482));e=t,e.status=`pending`,e.then(function(e){if(t.status===`pending`){var n=t;n.status=`fulfilled`,n.value=e}},function(e){if(t.status===`pending`){var n=t;n.status=`rejected`,n.reason=e}})}switch(t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,Ra(e),e}throw Ia=t,ka}}function Fa(e){try{var t=e._init;return t(e._payload)}catch(e){throw typeof e==`object`&&e&&typeof e.then==`function`?(Ia=e,ka):e}}var Ia=null;function La(){if(Ia===null)throw Error(i(459));var e=Ia;return Ia=null,e}function Ra(e){if(e===ka||e===ja)throw Error(i(483))}var za=null,Ba=0;function Va(e){var t=Ba;return Ba+=1,za===null&&(za=[]),Pa(za,e,t)}function Ha(e,t){t=t.props.ref,e.ref=t===void 0?null:t}function Ua(e,t){throw t.$$typeof===g?Error(i(525)):(e=Object.prototype.toString.call(t),Error(i(31,e===`[object Object]`?`object with keys {`+Object.keys(t).join(`, `)+`}`:e)))}function Wa(e){function t(t,n){if(e){var r=t.deletions;r===null?(t.deletions=[n],t.flags|=16):r.push(n)}}function n(n,r){if(!e)return null;for(;r!==null;)t(n,r),r=r.sibling;return null}function r(e){for(var t=new Map;e!==null;)e.key===null?t.set(e.index,e):t.set(e.key,e),e=e.sibling;return t}function a(e,t){return e=_i(e,t),e.index=0,e.sibling=null,e}function o(t,n,r){return t.index=r,e?(r=t.alternate,r===null?(t.flags|=67108866,n):(r=r.index,r<n?(t.flags|=67108866,n):r)):(t.flags|=1048576,n)}function s(t){return e&&t.alternate===null&&(t.flags|=67108866),t}function c(e,t,n,r){return t===null||t.tag!==6?(t=xi(n,e.mode,r),t.return=e,t):(t=a(t,n),t.return=e,t)}function l(e,t,n,r){var i=n.type;return i===y?d(e,t,n.props.children,r,n.key):t!==null&&(t.elementType===i||typeof i==`object`&&i&&i.$$typeof===D&&Fa(i)===t.type)?(t=a(t,n.props),Ha(t,n),t.return=e,t):(t=yi(n.type,n.key,n.props,null,e.mode,r),Ha(t,n),t.return=e,t)}function u(e,t,n,r){return t===null||t.tag!==4||t.stateNode.containerInfo!==n.containerInfo||t.stateNode.implementation!==n.implementation?(t=Ci(n,e.mode,r),t.return=e,t):(t=a(t,n.children||[]),t.return=e,t)}function d(e,t,n,r,i){return t===null||t.tag!==7?(t=bi(n,e.mode,r,i),t.return=e,t):(t=a(t,n),t.return=e,t)}function f(e,t,n){if(typeof t==`string`&&t!==``||typeof t==`number`||typeof t==`bigint`)return t=xi(``+t,e.mode,n),t.return=e,t;if(typeof t==`object`&&t){switch(t.$$typeof){case _:return n=yi(t.type,t.key,t.props,null,e.mode,n),Ha(n,t),n.return=e,n;case v:return t=Ci(t,e.mode,n),t.return=e,t;case D:return t=Fa(t),f(e,t,n)}if(oe(t)||re(t))return t=bi(t,e.mode,n,null),t.return=e,t;if(typeof t.then==`function`)return f(e,Va(t),n);if(t.$$typeof===C)return f(e,la(e,t),n);Ua(e,t)}return null}function p(e,t,n,r){var i=t===null?null:t.key;if(typeof n==`string`&&n!==``||typeof n==`number`||typeof n==`bigint`)return i===null?c(e,t,``+n,r):null;if(typeof n==`object`&&n){switch(n.$$typeof){case _:return n.key===i?l(e,t,n,r):null;case v:return n.key===i?u(e,t,n,r):null;case D:return n=Fa(n),p(e,t,n,r)}if(oe(n)||re(n))return i===null?d(e,t,n,r,null):null;if(typeof n.then==`function`)return p(e,t,Va(n),r);if(n.$$typeof===C)return p(e,t,la(e,n),r);Ua(e,n)}return null}function m(e,t,n,r,i){if(typeof r==`string`&&r!==``||typeof r==`number`||typeof r==`bigint`)return e=e.get(n)||null,c(t,e,``+r,i);if(typeof r==`object`&&r){switch(r.$$typeof){case _:return e=e.get(r.key===null?n:r.key)||null,l(t,e,r,i);case v:return e=e.get(r.key===null?n:r.key)||null,u(t,e,r,i);case D:return r=Fa(r),m(e,t,n,r,i)}if(oe(r)||re(r))return e=e.get(n)||null,d(t,e,r,i,null);if(typeof r.then==`function`)return m(e,t,n,Va(r),i);if(r.$$typeof===C)return m(e,t,n,la(t,r),i);Ua(t,r)}return null}function h(i,a,s,c){for(var l=null,u=null,d=a,h=a=0,g=null;d!==null&&h<s.length;h++){d.index>h?(g=d,d=null):g=d.sibling;var _=p(i,d,s[h],c);if(_===null){d===null&&(d=g);break}e&&d&&_.alternate===null&&t(i,d),a=o(_,a,h),u===null?l=_:u.sibling=_,u=_,d=g}if(h===s.length)return n(i,d),M&&Fi(i,h),l;if(d===null){for(;h<s.length;h++)d=f(i,s[h],c),d!==null&&(a=o(d,a,h),u===null?l=d:u.sibling=d,u=d);return M&&Fi(i,h),l}for(d=r(d);h<s.length;h++)g=m(d,i,h,s[h],c),g!==null&&(e&&g.alternate!==null&&d.delete(g.key===null?h:g.key),a=o(g,a,h),u===null?l=g:u.sibling=g,u=g);return e&&d.forEach(function(e){return t(i,e)}),M&&Fi(i,h),l}function g(a,s,c,l){if(c==null)throw Error(i(151));for(var u=null,d=null,h=s,g=s=0,_=null,v=c.next();h!==null&&!v.done;g++,v=c.next()){h.index>g?(_=h,h=null):_=h.sibling;var y=p(a,h,v.value,l);if(y===null){h===null&&(h=_);break}e&&h&&y.alternate===null&&t(a,h),s=o(y,s,g),d===null?u=y:d.sibling=y,d=y,h=_}if(v.done)return n(a,h),M&&Fi(a,g),u;if(h===null){for(;!v.done;g++,v=c.next())v=f(a,v.value,l),v!==null&&(s=o(v,s,g),d===null?u=v:d.sibling=v,d=v);return M&&Fi(a,g),u}for(h=r(h);!v.done;g++,v=c.next())v=m(h,a,g,v.value,l),v!==null&&(e&&v.alternate!==null&&h.delete(v.key===null?g:v.key),s=o(v,s,g),d===null?u=v:d.sibling=v,d=v);return e&&h.forEach(function(e){return t(a,e)}),M&&Fi(a,g),u}function b(e,r,o,c){if(typeof o==`object`&&o&&o.type===y&&o.key===null&&(o=o.props.children),typeof o==`object`&&o){switch(o.$$typeof){case _:a:{for(var l=o.key;r!==null;){if(r.key===l){if(l=o.type,l===y){if(r.tag===7){n(e,r.sibling),c=a(r,o.props.children),c.return=e,e=c;break a}}else if(r.elementType===l||typeof l==`object`&&l&&l.$$typeof===D&&Fa(l)===r.type){n(e,r.sibling),c=a(r,o.props),Ha(c,o),c.return=e,e=c;break a}n(e,r);break}t(e,r),r=r.sibling}o.type===y?(c=bi(o.props.children,e.mode,c,o.key),c.return=e,e=c):(c=yi(o.type,o.key,o.props,null,e.mode,c),Ha(c,o),c.return=e,e=c)}return s(e);case v:a:{for(l=o.key;r!==null;){if(r.key===l){if(r.tag===4&&r.stateNode.containerInfo===o.containerInfo&&r.stateNode.implementation===o.implementation){n(e,r.sibling),c=a(r,o.children||[]),c.return=e,e=c;break a}n(e,r);break}t(e,r),r=r.sibling}c=Ci(o,e.mode,c),c.return=e,e=c}return s(e);case D:return o=Fa(o),b(e,r,o,c)}if(oe(o))return h(e,r,o,c);if(re(o)){if(l=re(o),typeof l!=`function`)throw Error(i(150));return o=l.call(o),g(e,r,o,c)}if(typeof o.then==`function`)return b(e,r,Va(o),c);if(o.$$typeof===C)return b(e,r,la(e,o),c);Ua(e,o)}return typeof o==`string`&&o!==``||typeof o==`number`||typeof o==`bigint`?(o=``+o,r!==null&&r.tag===6?(n(e,r.sibling),c=a(r,o),c.return=e,e=c):(n(e,r),c=xi(o,e.mode,c),c.return=e,e=c),s(e)):n(e,r)}return function(e,t,n,r){try{Ba=0;var i=b(e,t,n,r);return za=null,i}catch(t){if(t===ka||t===ja)throw t;var a=hi(29,t,null,e.mode);return a.lanes=r,a.return=e,a}}}var Ga=Wa(!0),Ka=Wa(!1),qa=!1;function Ja(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function Ya(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function Xa(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function Za(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,V&2){var i=r.pending;return i===null?t.next=t:(t.next=i.next,i.next=t),r.pending=t,t=fi(e),di(e,null,n),t}return ci(e,r,t,n),fi(e)}function Qa(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,n&4194048)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,st(e,n)}}function $a(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var i=null,a=null;if(n=n.firstBaseUpdate,n!==null){do{var o={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};a===null?i=a=o:a=a.next=o,n=n.next}while(n!==null);a===null?i=a=t:a=a.next=t}else i=a=t;n={baseState:r.baseState,firstBaseUpdate:i,lastBaseUpdate:a,shared:r.shared,callbacks:r.callbacks},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var eo=!1;function to(){if(eo){var e=ba;if(e!==null)throw e}}function no(e,t,n,r){eo=!1;var i=e.updateQueue;qa=!1;var a=i.firstBaseUpdate,o=i.lastBaseUpdate,s=i.shared.pending;if(s!==null){i.shared.pending=null;var c=s,l=c.next;c.next=null,o===null?a=l:o.next=l,o=c;var u=e.alternate;u!==null&&(u=u.updateQueue,s=u.lastBaseUpdate,s!==o&&(s===null?u.firstBaseUpdate=l:s.next=l,u.lastBaseUpdate=c))}if(a!==null){var d=i.baseState;o=0,u=l=c=null,s=a;do{var f=s.lane&-536870913,p=f!==s.lane;if(p?(U&f)===f:(r&f)===f){f!==0&&f===ya&&(eo=!0),u!==null&&(u=u.next={lane:0,tag:s.tag,payload:s.payload,callback:null,next:null});a:{var h=e,g=s;f=t;var _=n;switch(g.tag){case 1:if(h=g.payload,typeof h==`function`){d=h.call(_,d,f);break a}d=h;break a;case 3:h.flags=h.flags&-65537|128;case 0:if(h=g.payload,f=typeof h==`function`?h.call(_,d,f):h,f==null)break a;d=m({},d,f);break a;case 2:qa=!0}}f=s.callback,f!==null&&(e.flags|=64,p&&(e.flags|=8192),p=i.callbacks,p===null?i.callbacks=[f]:p.push(f))}else p={lane:f,tag:s.tag,payload:s.payload,callback:s.callback,next:null},u===null?(l=u=p,c=d):u=u.next=p,o|=f;if(s=s.next,s===null){if(s=i.shared.pending,s===null)break;p=s,s=p.next,p.next=null,i.lastBaseUpdate=p,i.shared.pending=null}}while(1);u===null&&(c=d),i.baseState=c,i.firstBaseUpdate=l,i.lastBaseUpdate=u,a===null&&(i.shared.lanes=0),Ql|=o,e.lanes=o,e.memoizedState=d}}function ro(e,t){if(typeof e!=`function`)throw Error(i(191,e));e.call(t)}function io(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)ro(n[e],t)}var ao=ue(null),oo=ue(0);function so(e,t){e=Xl,fe(oo,e),fe(ao,t),Xl=e|t.baseLanes}function co(){fe(oo,Xl),fe(ao,ao.current)}function lo(){Xl=oo.current,de(ao),de(oo)}var uo=ue(null),fo=null;function po(e){var t=e.alternate;fe(vo,vo.current&1),fe(uo,e),fo===null&&(t===null||ao.current!==null||t.memoizedState!==null)&&(fo=e)}function mo(e){fe(vo,vo.current),fe(uo,e),fo===null&&(fo=e)}function ho(e){e.tag===22?(fe(vo,vo.current),fe(uo,e),fo===null&&(fo=e)):go(e)}function go(){fe(vo,vo.current),fe(uo,uo.current)}function _o(e){de(uo),fo===e&&(fo=null),de(vo)}var vo=ue(0);function yo(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||mf(n)||hf(n)))return t}else if(t.tag===19&&(t.memoizedProps.revealOrder===`forwards`||t.memoizedProps.revealOrder===`backwards`||t.memoizedProps.revealOrder===`unstable_legacy-backwards`||t.memoizedProps.revealOrder===`together`)){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var bo=0,N=null,xo=null,So=null,Co=!1,wo=!1,To=!1,Eo=0,Do=0,Oo=null,ko=0;function Ao(){throw Error(i(321))}function jo(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!kr(e[n],t[n]))return!1;return!0}function Mo(e,t,n,r,i,a){return bo=a,N=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,k.H=e===null||e.memoizedState===null?Ks:qs,To=!1,a=n(r,i),To=!1,wo&&(a=Po(t,n,r,i)),No(e),a}function No(e){k.H=Gs;var t=xo!==null&&xo.next!==null;if(bo=0,So=xo=N=null,Co=!1,Do=0,Oo=null,t)throw Error(i(300));e===null||uc||(e=e.dependencies,e!==null&&oa(e)&&(uc=!0))}function Po(e,t,n,r){N=e;var a=0;do{if(wo&&(Oo=null),Do=0,wo=!1,25<=a)throw Error(i(301));if(a+=1,So=xo=null,e.updateQueue!=null){var o=e.updateQueue;o.lastEffect=null,o.events=null,o.stores=null,o.memoCache!=null&&(o.memoCache.index=0)}k.H=Js,o=t(n,r)}while(wo);return o}function Fo(){var e=k.H,t=e.useState()[0];return t=typeof t.then==`function`?Ho(t):t,e=e.useState()[0],(xo===null?null:xo.memoizedState)!==e&&(N.flags|=1024),t}function Io(){var e=Eo!==0;return Eo=0,e}function Lo(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function Ro(e){if(Co){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}Co=!1}bo=0,So=xo=N=null,wo=!1,Do=Eo=0,Oo=null}function zo(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return So===null?N.memoizedState=So=e:So=So.next=e,So}function Bo(){if(xo===null){var e=N.alternate;e=e===null?null:e.memoizedState}else e=xo.next;var t=So===null?N.memoizedState:So.next;if(t!==null)So=t,xo=e;else{if(e===null)throw N.alternate===null?Error(i(467)):Error(i(310));xo=e,e={memoizedState:xo.memoizedState,baseState:xo.baseState,baseQueue:xo.baseQueue,queue:xo.queue,next:null},So===null?N.memoizedState=So=e:So=So.next=e}return So}function Vo(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function Ho(e){var t=Do;return Do+=1,Oo===null&&(Oo=[]),e=Pa(Oo,e,t),t=N,(So===null?t.memoizedState:So.next)===null&&(t=t.alternate,k.H=t===null||t.memoizedState===null?Ks:qs),e}function P(e){if(typeof e==`object`&&e){if(typeof e.then==`function`)return Ho(e);if(e.$$typeof===C)return ca(e)}throw Error(i(438,String(e)))}function Uo(e){var t=null,n=N.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var r=N.alternate;r!==null&&(r=r.updateQueue,r!==null&&(r=r.memoCache,r!=null&&(t={data:r.data.map(function(e){return e.slice()}),index:0})))}if(t??={data:[],index:0},n===null&&(n=Vo(),N.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),r=0;r<e;r++)n[r]=te;return t.index++,n}function Wo(e,t){return typeof t==`function`?t(e):t}function Go(e){return Ko(Bo(),xo,e)}function Ko(e,t,n){var r=e.queue;if(r===null)throw Error(i(311));r.lastRenderedReducer=n;var a=e.baseQueue,o=r.pending;if(o!==null){if(a!==null){var s=a.next;a.next=o.next,o.next=s}t.baseQueue=a=o,r.pending=null}if(o=e.baseState,a===null)e.memoizedState=o;else{t=a.next;var c=s=null,l=null,u=t,d=!1;do{var f=u.lane&-536870913;if(f===u.lane?(bo&f)===f:(U&f)===f){var p=u.revertLane;if(p===0)l!==null&&(l=l.next={lane:0,revertLane:0,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null}),f===ya&&(d=!0);else if((bo&p)===p){u=u.next,p===ya&&(d=!0);continue}else f={lane:0,revertLane:u.revertLane,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=f,s=o):l=l.next=f,N.lanes|=p,Ql|=p;f=u.action,To&&n(o,f),o=u.hasEagerState?u.eagerState:n(o,f)}else p={lane:f,revertLane:u.revertLane,gesture:u.gesture,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=p,s=o):l=l.next=p,N.lanes|=f,Ql|=f;u=u.next}while(u!==null&&u!==t);if(l===null?s=o:l.next=c,!kr(o,e.memoizedState)&&(uc=!0,d&&(n=ba,n!==null)))throw n;e.memoizedState=o,e.baseState=s,e.baseQueue=l,r.lastRenderedState=o}return a===null&&(r.lanes=0),[e.memoizedState,r.dispatch]}function qo(e){var t=Bo(),n=t.queue;if(n===null)throw Error(i(311));n.lastRenderedReducer=e;var r=n.dispatch,a=n.pending,o=t.memoizedState;if(a!==null){n.pending=null;var s=a=a.next;do o=e(o,s.action),s=s.next;while(s!==a);kr(o,t.memoizedState)||(uc=!0),t.memoizedState=o,t.baseQueue===null&&(t.baseState=o),n.lastRenderedState=o}return[o,r]}function Jo(e,t,n){var r=N,a=Bo(),o=M;if(o){if(n===void 0)throw Error(i(407));n=n()}else n=t();var s=!kr((xo||a).memoizedState,n);if(s&&(a.memoizedState=n,uc=!0),a=a.queue,_s(Zo.bind(null,r,a,e),[e]),a.getSnapshot!==t||s||So!==null&&So.memoizedState.tag&1){if(r.flags|=2048,ps(9,{destroy:void 0},Xo.bind(null,r,a,n,t),null),Wl===null)throw Error(i(349));o||bo&127||Yo(r,t,n)}return n}function Yo(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=N.updateQueue,t===null?(t=Vo(),N.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Xo(e,t,n,r){t.value=n,t.getSnapshot=r,Qo(t)&&$o(e)}function Zo(e,t,n){return n(function(){Qo(t)&&$o(e)})}function Qo(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!kr(e,n)}catch{return!0}}function $o(e){var t=ui(e,2);t!==null&&Su(t,e,2)}function es(e){var t=zo();if(typeof e==`function`){var n=e;if(e=n(),To){We(!0);try{n()}finally{We(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Wo,lastRenderedState:e},t}function ts(e,t,n,r){return e.baseState=n,Ko(e,xo,typeof r==`function`?r:Wo)}function ns(e,t,n,r,a){if(Hs(e))throw Error(i(485));if(e=t.action,e!==null){var o={payload:a,action:e,next:null,isTransition:!0,status:`pending`,value:null,reason:null,listeners:[],then:function(e){o.listeners.push(e)}};k.T===null?o.isTransition=!1:n(!0),r(o),n=t.pending,n===null?(o.next=t.pending=o,rs(t,o)):(o.next=n.next,t.pending=n.next=o)}}function rs(e,t){var n=t.action,r=t.payload,i=e.state;if(t.isTransition){var a=k.T,o={};k.T=o;try{var s=n(i,r),c=k.S;c!==null&&c(o,s),is(e,t,s)}catch(n){os(e,t,n)}finally{a!==null&&o.types!==null&&(a.types=o.types),k.T=a}}else try{a=n(i,r),is(e,t,a)}catch(n){os(e,t,n)}}function is(e,t,n){typeof n==`object`&&n&&typeof n.then==`function`?n.then(function(n){as(e,t,n)},function(n){return os(e,t,n)}):as(e,t,n)}function as(e,t,n){t.status=`fulfilled`,t.value=n,ss(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,rs(e,n)))}function os(e,t,n){var r=e.pending;if(e.pending=null,r!==null){r=r.next;do t.status=`rejected`,t.reason=n,ss(t),t=t.next;while(t!==r)}e.action=null}function ss(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function cs(e,t){return t}function ls(e,t){if(M){var n=Wl.formState;if(n!==null){a:{var r=N;if(M){if(Vi){b:{for(var i=Vi,a=Ui;i.nodeType!==8;){if(!a){i=null;break b}if(i=_f(i.nextSibling),i===null){i=null;break b}}a=i.data,i=a===`F!`||a===`F`?i:null}if(i){Vi=_f(i.nextSibling),r=i.data===`F!`;break a}}Gi(r)}r=!1}r&&(t=n[0])}}return n=zo(),n.memoizedState=n.baseState=t,r={pending:null,lanes:0,dispatch:null,lastRenderedReducer:cs,lastRenderedState:t},n.queue=r,n=zs.bind(null,N,r),r.dispatch=n,r=es(!1),a=Vs.bind(null,N,!1,r.queue),r=zo(),i={state:t,dispatch:null,action:e,pending:null},r.queue=i,n=ns.bind(null,N,i,a,n),i.dispatch=n,r.memoizedState=e,[t,n,!1]}function us(e){return ds(Bo(),xo,e)}function ds(e,t,n){if(t=Ko(e,t,cs)[0],e=Go(Wo)[0],typeof t==`object`&&t&&typeof t.then==`function`)try{var r=Ho(t)}catch(e){throw e===ka?ja:e}else r=t;t=Bo();var i=t.queue,a=i.dispatch;return n!==t.memoizedState&&(N.flags|=2048,ps(9,{destroy:void 0},F.bind(null,i,n),null)),[r,a,e]}function F(e,t){e.action=t}function fs(e){var t=Bo(),n=xo;if(n!==null)return ds(t,n,e);Bo(),t=t.memoizedState,n=Bo();var r=n.queue.dispatch;return n.memoizedState=e,[t,r,!1]}function ps(e,t,n,r){return e={tag:e,create:n,deps:r,inst:t,next:null},t=N.updateQueue,t===null&&(t=Vo(),N.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e),e}function I(){return Bo().memoizedState}function ms(e,t,n,r){var i=zo();N.flags|=e,i.memoizedState=ps(1|t,{destroy:void 0},n,r===void 0?null:r)}function hs(e,t,n,r){var i=Bo();r=r===void 0?null:r;var a=i.memoizedState.inst;xo!==null&&r!==null&&jo(r,xo.memoizedState.deps)?i.memoizedState=ps(t,a,n,r):(N.flags|=e,i.memoizedState=ps(1|t,a,n,r))}function gs(e,t){ms(8390656,8,e,t)}function _s(e,t){hs(2048,8,e,t)}function vs(e){N.flags|=4;var t=N.updateQueue;if(t===null)t=Vo(),N.updateQueue=t,t.events=[e];else{var n=t.events;n===null?t.events=[e]:n.push(e)}}function ys(e){var t=Bo().memoizedState;return vs({ref:t,nextImpl:e}),function(){if(V&2)throw Error(i(440));return t.impl.apply(void 0,arguments)}}function bs(e,t){return hs(4,2,e,t)}function xs(e,t){return hs(4,4,e,t)}function Ss(e,t){if(typeof t==`function`){e=e();var n=t(e);return function(){typeof n==`function`?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Cs(e,t,n){n=n==null?null:n.concat([e]),hs(4,4,Ss.bind(null,t,e),n)}function ws(){}function Ts(e,t){var n=Bo();t=t===void 0?null:t;var r=n.memoizedState;return t!==null&&jo(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function Es(e,t){var n=Bo();t=t===void 0?null:t;var r=n.memoizedState;if(t!==null&&jo(t,r[1]))return r[0];if(r=e(),To){We(!0);try{e()}finally{We(!1)}}return n.memoizedState=[r,t],r}function Ds(e,t,n){return n===void 0||bo&1073741824&&!(U&261930)?e.memoizedState=t:(e.memoizedState=n,e=xu(),N.lanes|=e,Ql|=e,n)}function Os(e,t,n,r){return kr(n,t)?n:ao.current===null?!(bo&42)||bo&1073741824&&!(U&261930)?(uc=!0,e.memoizedState=n):(e=xu(),N.lanes|=e,Ql|=e,t):(e=Ds(e,n,r),kr(e,t)||(uc=!0),e)}function ks(e,t,n,r,i){var a=A.p;A.p=a!==0&&8>a?a:8;var o=k.T,s={};k.T=s,Vs(e,!1,t,n);try{var c=i(),l=k.S;l!==null&&l(s,c),typeof c==`object`&&c&&typeof c.then==`function`?Bs(e,t,Ca(c,r),bu(e)):Bs(e,t,r,bu(e))}catch(n){Bs(e,t,{then:function(){},status:`rejected`,reason:n},bu())}finally{A.p=a,o!==null&&s.types!==null&&(o.types=s.types),k.T=o}}function As(){}function js(e,t,n,r){if(e.tag!==5)throw Error(i(476));var a=Ms(e).queue;ks(e,a,t,se,n===null?As:function(){return Ns(e),n(r)})}function Ms(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:se,baseState:se,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Wo,lastRenderedState:se},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Wo,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function Ns(e){var t=Ms(e);t.next===null&&(t=e.alternate.memoizedState),Bs(e,t.next.queue,{},bu())}function Ps(){return ca(sp)}function Fs(){return Bo().memoizedState}function Is(){return Bo().memoizedState}function Ls(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=bu();e=Xa(n);var r=Za(t,e,n);r!==null&&(Su(r,t,n),Qa(r,t,n)),t={cache:ha()},e.payload=t;return}t=t.return}}function Rs(e,t,n){var r=bu();n={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},Hs(e)?Us(t,n):(n=li(e,t,n,r),n!==null&&(Su(n,e,r),Ws(n,t,r)))}function zs(e,t,n){Bs(e,t,n,bu())}function Bs(e,t,n,r){var i={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(Hs(e))Us(t,i);else{var a=e.alternate;if(e.lanes===0&&(a===null||a.lanes===0)&&(a=t.lastRenderedReducer,a!==null))try{var o=t.lastRenderedState,s=a(o,n);if(i.hasEagerState=!0,i.eagerState=s,kr(s,o))return ci(e,t,i,0),Wl===null&&si(),!1}catch{}if(n=li(e,t,i,r),n!==null)return Su(n,e,r),Ws(n,t,r),!0}return!1}function Vs(e,t,n,r){if(r={lane:2,revertLane:yd(),gesture:null,action:r,hasEagerState:!1,eagerState:null,next:null},Hs(e)){if(t)throw Error(i(479))}else t=li(e,n,r,2),t!==null&&Su(t,e,2)}function Hs(e){var t=e.alternate;return e===N||t!==null&&t===N}function Us(e,t){wo=Co=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Ws(e,t,n){if(n&4194048){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,st(e,n)}}var Gs={readContext:ca,use:P,useCallback:Ao,useContext:Ao,useEffect:Ao,useImperativeHandle:Ao,useLayoutEffect:Ao,useInsertionEffect:Ao,useMemo:Ao,useReducer:Ao,useRef:Ao,useState:Ao,useDebugValue:Ao,useDeferredValue:Ao,useTransition:Ao,useSyncExternalStore:Ao,useId:Ao,useHostTransitionStatus:Ao,useFormState:Ao,useActionState:Ao,useOptimistic:Ao,useMemoCache:Ao,useCacheRefresh:Ao};Gs.useEffectEvent=Ao;var Ks={readContext:ca,use:P,useCallback:function(e,t){return zo().memoizedState=[e,t===void 0?null:t],e},useContext:ca,useEffect:gs,useImperativeHandle:function(e,t,n){n=n==null?null:n.concat([e]),ms(4194308,4,Ss.bind(null,t,e),n)},useLayoutEffect:function(e,t){return ms(4194308,4,e,t)},useInsertionEffect:function(e,t){ms(4,2,e,t)},useMemo:function(e,t){var n=zo();t=t===void 0?null:t;var r=e();if(To){We(!0);try{e()}finally{We(!1)}}return n.memoizedState=[r,t],r},useReducer:function(e,t,n){var r=zo();if(n!==void 0){var i=n(t);if(To){We(!0);try{n(t)}finally{We(!1)}}}else i=t;return r.memoizedState=r.baseState=i,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:i},r.queue=e,e=e.dispatch=Rs.bind(null,N,e),[r.memoizedState,e]},useRef:function(e){var t=zo();return e={current:e},t.memoizedState=e},useState:function(e){e=es(e);var t=e.queue,n=zs.bind(null,N,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:ws,useDeferredValue:function(e,t){return Ds(zo(),e,t)},useTransition:function(){var e=es(!1);return e=ks.bind(null,N,e.queue,!0,!1),zo().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var r=N,a=zo();if(M){if(n===void 0)throw Error(i(407));n=n()}else{if(n=t(),Wl===null)throw Error(i(349));U&127||Yo(r,t,n)}a.memoizedState=n;var o={value:n,getSnapshot:t};return a.queue=o,gs(Zo.bind(null,r,o,e),[e]),r.flags|=2048,ps(9,{destroy:void 0},Xo.bind(null,r,o,n,t),null),n},useId:function(){var e=zo(),t=Wl.identifierPrefix;if(M){var n=Pi,r=Ni;n=(r&~(1<<32-Ge(r)-1)).toString(32)+n,t=`_`+t+`R_`+n,n=Eo++,0<n&&(t+=`H`+n.toString(32)),t+=`_`}else n=ko++,t=`_`+t+`r_`+n.toString(32)+`_`;return e.memoizedState=t},useHostTransitionStatus:Ps,useFormState:ls,useActionState:ls,useOptimistic:function(e){var t=zo();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=Vs.bind(null,N,!0,n),n.dispatch=t,[e,t]},useMemoCache:Uo,useCacheRefresh:function(){return zo().memoizedState=Ls.bind(null,N)},useEffectEvent:function(e){var t=zo(),n={impl:e};return t.memoizedState=n,function(){if(V&2)throw Error(i(440));return n.impl.apply(void 0,arguments)}}},qs={readContext:ca,use:P,useCallback:Ts,useContext:ca,useEffect:_s,useImperativeHandle:Cs,useInsertionEffect:bs,useLayoutEffect:xs,useMemo:Es,useReducer:Go,useRef:I,useState:function(){return Go(Wo)},useDebugValue:ws,useDeferredValue:function(e,t){return Os(Bo(),xo.memoizedState,e,t)},useTransition:function(){var e=Go(Wo)[0],t=Bo().memoizedState;return[typeof e==`boolean`?e:Ho(e),t]},useSyncExternalStore:Jo,useId:Fs,useHostTransitionStatus:Ps,useFormState:us,useActionState:us,useOptimistic:function(e,t){return ts(Bo(),xo,e,t)},useMemoCache:Uo,useCacheRefresh:Is};qs.useEffectEvent=ys;var Js={readContext:ca,use:P,useCallback:Ts,useContext:ca,useEffect:_s,useImperativeHandle:Cs,useInsertionEffect:bs,useLayoutEffect:xs,useMemo:Es,useReducer:qo,useRef:I,useState:function(){return qo(Wo)},useDebugValue:ws,useDeferredValue:function(e,t){var n=Bo();return xo===null?Ds(n,e,t):Os(n,xo.memoizedState,e,t)},useTransition:function(){var e=qo(Wo)[0],t=Bo().memoizedState;return[typeof e==`boolean`?e:Ho(e),t]},useSyncExternalStore:Jo,useId:Fs,useHostTransitionStatus:Ps,useFormState:fs,useActionState:fs,useOptimistic:function(e,t){var n=Bo();return xo===null?(n.baseState=e,[e,n.queue.dispatch]):ts(n,xo,e,t)},useMemoCache:Uo,useCacheRefresh:Is};Js.useEffectEvent=ys;function Ys(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:m({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Xs={enqueueSetState:function(e,t,n){e=e._reactInternals;var r=bu(),i=Xa(r);i.payload=t,n!=null&&(i.callback=n),t=Za(e,i,r),t!==null&&(Su(t,e,r),Qa(t,e,r))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=bu(),i=Xa(r);i.tag=1,i.payload=t,n!=null&&(i.callback=n),t=Za(e,i,r),t!==null&&(Su(t,e,r),Qa(t,e,r))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=bu(),r=Xa(n);r.tag=2,t!=null&&(r.callback=t),t=Za(e,r,n),t!==null&&(Su(t,e,n),Qa(t,e,n))}};function Zs(e,t,n,r,i,a,o){return e=e.stateNode,typeof e.shouldComponentUpdate==`function`?e.shouldComponentUpdate(r,a,o):t.prototype&&t.prototype.isPureReactComponent?!Ar(n,r)||!Ar(i,a):!0}function Qs(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps==`function`&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps==`function`&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&Xs.enqueueReplaceState(t,t.state,null)}function $s(e,t){var n=t;if(`ref`in t)for(var r in n={},t)r!==`ref`&&(n[r]=t[r]);if(e=e.defaultProps)for(var i in n===t&&(n=m({},n)),e)n[i]===void 0&&(n[i]=e[i]);return n}function ec(e){ri(e)}function tc(e){console.error(e)}function nc(e){ri(e)}function rc(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(e){setTimeout(function(){throw e})}}function ic(e,t,n){try{var r=e.onCaughtError;r(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(e){setTimeout(function(){throw e})}}function ac(e,t,n){return n=Xa(n),n.tag=3,n.payload={element:null},n.callback=function(){rc(e,t)},n}function oc(e){return e=Xa(e),e.tag=3,e}function sc(e,t,n,r){var i=n.type.getDerivedStateFromError;if(typeof i==`function`){var a=r.value;e.payload=function(){return i(a)},e.callback=function(){ic(t,n,r)}}var o=n.stateNode;o!==null&&typeof o.componentDidCatch==`function`&&(e.callback=function(){ic(t,n,r),typeof i!=`function`&&(uu===null?uu=new Set([this]):uu.add(this));var e=r.stack;this.componentDidCatch(r.value,{componentStack:e===null?``:e})})}function cc(e,t,n,r,a){if(n.flags|=32768,typeof r==`object`&&r&&typeof r.then==`function`){if(t=n.alternate,t!==null&&aa(t,n,a,!0),n=uo.current,n!==null){switch(n.tag){case 31:case 13:return fo===null?Pu():n.alternate===null&&Zl===0&&(Zl=3),n.flags&=-257,n.flags|=65536,n.lanes=a,r===Ma?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([r]):t.add(r),$u(e,r,a)),!1;case 22:return n.flags|=65536,r===Ma?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([r])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([r]):n.add(r)),$u(e,r,a)),!1}throw Error(i(435,n.tag))}return $u(e,r,a),Pu(),!1}if(M)return t=uo.current,t===null?(r!==Wi&&(t=Error(i(423),{cause:r}),Zi(Ti(t,n))),e=e.current.alternate,e.flags|=65536,a&=-a,e.lanes|=a,r=Ti(r,n),a=ac(e.stateNode,r,a),$a(e,a),Zl!==4&&(Zl=2)):(!(t.flags&65536)&&(t.flags|=256),t.flags|=65536,t.lanes=a,r!==Wi&&(e=Error(i(422),{cause:r}),Zi(Ti(e,n)))),!1;var o=Error(i(520),{cause:r});if(o=Ti(o,n),ru===null?ru=[o]:ru.push(o),Zl!==4&&(Zl=2),t===null)return!0;r=Ti(r,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=a&-a,n.lanes|=e,e=ac(n.stateNode,r,e),$a(n,e),!1;case 1:if(t=n.type,o=n.stateNode,!(n.flags&128)&&(typeof t.getDerivedStateFromError==`function`||o!==null&&typeof o.componentDidCatch==`function`&&(uu===null||!uu.has(o))))return n.flags|=65536,a&=-a,n.lanes|=a,a=oc(a),sc(a,e,n,r),$a(n,a),!1}n=n.return}while(n!==null);return!1}var lc=Error(i(461)),uc=!1;function dc(e,t,n,r){t.child=e===null?Ka(t,null,n,r):Ga(t,e.child,n,r)}function fc(e,t,n,r,i){n=n.render;var a=t.ref;if(`ref`in r){var o={};for(var s in r)s!==`ref`&&(o[s]=r[s])}else o=r;return sa(t),r=Mo(e,t,n,o,a,i),s=Io(),e!==null&&!uc?(Lo(e,t,i),Ic(e,t,i)):(M&&s&&Li(t),t.flags|=1,dc(e,t,r,i),t.child)}function pc(e,t,n,r,i){if(e===null){var a=n.type;return typeof a==`function`&&!gi(a)&&a.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=a,mc(e,t,a,r,i)):(e=yi(n.type,null,r,t,t.mode,i),e.ref=t.ref,e.return=t,t.child=e)}if(a=e.child,!Lc(e,i)){var o=a.memoizedProps;if(n=n.compare,n=n===null?Ar:n,n(o,r)&&e.ref===t.ref)return Ic(e,t,i)}return t.flags|=1,e=_i(a,r),e.ref=t.ref,e.return=t,t.child=e}function mc(e,t,n,r,i){if(e!==null){var a=e.memoizedProps;if(Ar(a,r)&&e.ref===t.ref){if(uc=!1,t.pendingProps=r=a,Lc(e,i))e.flags&131072&&(uc=!0);else return t.lanes=e.lanes,Ic(e,t,i)}}return Sc(e,t,n,r,i)}function hc(e,t,n,r){var i=r.children,a=e===null?null:e.memoizedState;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),r.mode===`hidden`){if(t.flags&128){if(a=a===null?n:a.baseLanes|n,e!==null){for(r=t.child=e.child,i=0;r!==null;)i=i|r.lanes|r.childLanes,r=r.sibling;r=i&~a}else r=0,t.child=null;return _c(e,t,a,n,r)}if(n&536870912)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Da(t,a===null?null:a.cachePool),a===null?co():so(t,a),ho(t);else return r=t.lanes=536870912,_c(e,t,a===null?n:a.baseLanes|n,n,r)}else a===null?(e!==null&&Da(t,null),co(),go(t)):(Da(t,a.cachePool),so(t,a),go(t),t.memoizedState=null);return dc(e,t,i,n),t.child}function gc(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function _c(e,t,n,r,i){var a=Ea();return a=a===null?null:{parent:ma._currentValue,pool:a},t.memoizedState={baseLanes:n,cachePool:a},e!==null&&Da(t,null),co(),ho(t),e!==null&&aa(e,t,r,!0),t.childLanes=i,null}function vc(e,t){return t=jc({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function yc(e,t,n){return Ga(t,e.child,null,n),e=vc(t,t.pendingProps),e.flags|=2,_o(t),t.memoizedState=null,e}function bc(e,t,n){var r=t.pendingProps,a=!!(t.flags&128);if(t.flags&=-129,e===null){if(M){if(r.mode===`hidden`)return e=vc(t,r),t.lanes=536870912,gc(null,e);if(mo(t),(e=Vi)?(e=pf(e,Ui),e=e!==null&&e.data===`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Mi===null?null:{id:Ni,overflow:Pi},retryLane:536870912,hydrationErrors:null},n=Si(e),n.return=t,t.child=n,Bi=t,Vi=null)):e=null,e===null)throw Gi(t);return t.lanes=536870912,null}return vc(t,r)}var o=e.memoizedState;if(o!==null){var s=o.dehydrated;if(mo(t),a){if(t.flags&256)t.flags&=-257,t=yc(e,t,n);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(i(558))}else if(uc||aa(e,t,n,!1),a=(n&e.childLanes)!==0,uc||a){if(r=Wl,r!==null&&(s=ct(r,n),s!==0&&s!==o.retryLane))throw o.retryLane=s,ui(e,s),Su(r,e,s),lc;Pu(),t=yc(e,t,n)}else e=o.treeContext,Vi=_f(s.nextSibling),Bi=t,M=!0,Hi=null,Ui=!1,e!==null&&zi(t,e),t=vc(t,r),t.flags|=4096;return t}return e=_i(e.child,{mode:r.mode,children:r.children}),e.ref=t.ref,t.child=e,e.return=t,e}function xc(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!=`function`&&typeof n!=`object`)throw Error(i(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function Sc(e,t,n,r,i){return sa(t),n=Mo(e,t,n,r,void 0,i),r=Io(),e!==null&&!uc?(Lo(e,t,i),Ic(e,t,i)):(M&&r&&Li(t),t.flags|=1,dc(e,t,n,i),t.child)}function Cc(e,t,n,r,i,a){return sa(t),t.updateQueue=null,n=Po(t,r,n,i),No(e),r=Io(),e!==null&&!uc?(Lo(e,t,a),Ic(e,t,a)):(M&&r&&Li(t),t.flags|=1,dc(e,t,n,a),t.child)}function wc(e,t,n,r,i){if(sa(t),t.stateNode===null){var a=pi,o=n.contextType;typeof o==`object`&&o&&(a=ca(o)),a=new n(r,a),t.memoizedState=a.state!==null&&a.state!==void 0?a.state:null,a.updater=Xs,t.stateNode=a,a._reactInternals=t,a=t.stateNode,a.props=r,a.state=t.memoizedState,a.refs={},Ja(t),o=n.contextType,a.context=typeof o==`object`&&o?ca(o):pi,a.state=t.memoizedState,o=n.getDerivedStateFromProps,typeof o==`function`&&(Ys(t,n,o,r),a.state=t.memoizedState),typeof n.getDerivedStateFromProps==`function`||typeof a.getSnapshotBeforeUpdate==`function`||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(o=a.state,typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount(),o!==a.state&&Xs.enqueueReplaceState(a,a.state,null),no(t,r,a,i),to(),a.state=t.memoizedState),typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!0}else if(e===null){a=t.stateNode;var s=t.memoizedProps,c=$s(n,s);a.props=c;var l=a.context,u=n.contextType;o=pi,typeof u==`object`&&u&&(o=ca(u));var d=n.getDerivedStateFromProps;u=typeof d==`function`||typeof a.getSnapshotBeforeUpdate==`function`,s=t.pendingProps!==s,u||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(s||l!==o)&&Qs(t,a,r,o),qa=!1;var f=t.memoizedState;a.state=f,no(t,r,a,i),to(),l=t.memoizedState,s||f!==l||qa?(typeof d==`function`&&(Ys(t,n,d,r),l=t.memoizedState),(c=qa||Zs(t,n,c,r,f,l,o))?(u||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount==`function`&&(t.flags|=4194308)):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=l),a.props=r,a.state=l,a.context=o,r=c):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!1)}else{a=t.stateNode,Ya(e,t),o=t.memoizedProps,u=$s(n,o),a.props=u,d=t.pendingProps,f=a.context,l=n.contextType,c=pi,typeof l==`object`&&l&&(c=ca(l)),s=n.getDerivedStateFromProps,(l=typeof s==`function`||typeof a.getSnapshotBeforeUpdate==`function`)||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(o!==d||f!==c)&&Qs(t,a,r,c),qa=!1,f=t.memoizedState,a.state=f,no(t,r,a,i),to();var p=t.memoizedState;o!==d||f!==p||qa||e!==null&&e.dependencies!==null&&oa(e.dependencies)?(typeof s==`function`&&(Ys(t,n,s,r),p=t.memoizedState),(u=qa||Zs(t,n,u,r,f,p,c)||e!==null&&e.dependencies!==null&&oa(e.dependencies))?(l||typeof a.UNSAFE_componentWillUpdate!=`function`&&typeof a.componentWillUpdate!=`function`||(typeof a.componentWillUpdate==`function`&&a.componentWillUpdate(r,p,c),typeof a.UNSAFE_componentWillUpdate==`function`&&a.UNSAFE_componentWillUpdate(r,p,c)),typeof a.componentDidUpdate==`function`&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate==`function`&&(t.flags|=1024)):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=p),a.props=r,a.state=p,a.context=c,r=u):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),r=!1)}return a=r,xc(e,t),r=!!(t.flags&128),a||r?(a=t.stateNode,n=r&&typeof n.getDerivedStateFromError!=`function`?null:a.render(),t.flags|=1,e!==null&&r?(t.child=Ga(t,e.child,null,i),t.child=Ga(t,null,n,i)):dc(e,t,n,i),t.memoizedState=a.state,e=t.child):e=Ic(e,t,i),e}function Tc(e,t,n,r){return Yi(),t.flags|=256,dc(e,t,n,r),t.child}var Ec={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Dc(e){return{baseLanes:e,cachePool:Oa()}}function Oc(e,t,n){return e=e===null?0:e.childLanes&~n,t&&(e|=tu),e}function kc(e,t,n){var r=t.pendingProps,a=!1,o=!!(t.flags&128),s;if((s=o)||(s=e!==null&&e.memoizedState===null?!1:!!(vo.current&2)),s&&(a=!0,t.flags&=-129),s=!!(t.flags&32),t.flags&=-33,e===null){if(M){if(a?po(t):go(t),(e=Vi)?(e=pf(e,Ui),e=e!==null&&e.data!==`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Mi===null?null:{id:Ni,overflow:Pi},retryLane:536870912,hydrationErrors:null},n=Si(e),n.return=t,t.child=n,Bi=t,Vi=null)):e=null,e===null)throw Gi(t);return hf(e)?t.lanes=32:t.lanes=536870912,null}var c=r.children;return r=r.fallback,a?(go(t),a=t.mode,c=jc({mode:`hidden`,children:c},a),r=bi(r,a,n,null),c.return=t,r.return=t,c.sibling=r,t.child=c,r=t.child,r.memoizedState=Dc(n),r.childLanes=Oc(e,s,n),t.memoizedState=Ec,gc(null,r)):(po(t),Ac(t,c))}var l=e.memoizedState;if(l!==null&&(c=l.dehydrated,c!==null)){if(o)t.flags&256?(po(t),t.flags&=-257,t=Mc(e,t,n)):t.memoizedState===null?(go(t),c=r.fallback,a=t.mode,r=jc({mode:`visible`,children:r.children},a),c=bi(c,a,n,null),c.flags|=2,r.return=t,c.return=t,r.sibling=c,t.child=r,Ga(t,e.child,null,n),r=t.child,r.memoizedState=Dc(n),r.childLanes=Oc(e,s,n),t.memoizedState=Ec,t=gc(null,r)):(go(t),t.child=e.child,t.flags|=128,t=null);else if(po(t),hf(c)){if(s=c.nextSibling&&c.nextSibling.dataset,s)var u=s.dgst;s=u,r=Error(i(419)),r.stack=``,r.digest=s,Zi({value:r,source:null,stack:null}),t=Mc(e,t,n)}else if(uc||aa(e,t,n,!1),s=(n&e.childLanes)!==0,uc||s){if(s=Wl,s!==null&&(r=ct(s,n),r!==0&&r!==l.retryLane))throw l.retryLane=r,ui(e,r),Su(s,e,r),lc;mf(c)||Pu(),t=Mc(e,t,n)}else mf(c)?(t.flags|=192,t.child=e.child,t=null):(e=l.treeContext,Vi=_f(c.nextSibling),Bi=t,M=!0,Hi=null,Ui=!1,e!==null&&zi(t,e),t=Ac(t,r.children),t.flags|=4096);return t}return a?(go(t),c=r.fallback,a=t.mode,l=e.child,u=l.sibling,r=_i(l,{mode:`hidden`,children:r.children}),r.subtreeFlags=l.subtreeFlags&65011712,u===null?(c=bi(c,a,n,null),c.flags|=2):c=_i(u,c),c.return=t,r.return=t,r.sibling=c,t.child=r,gc(null,r),r=t.child,c=e.child.memoizedState,c===null?c=Dc(n):(a=c.cachePool,a===null?a=Oa():(l=ma._currentValue,a=a.parent===l?a:{parent:l,pool:l}),c={baseLanes:c.baseLanes|n,cachePool:a}),r.memoizedState=c,r.childLanes=Oc(e,s,n),t.memoizedState=Ec,gc(e.child,r)):(po(t),n=e.child,e=n.sibling,n=_i(n,{mode:`visible`,children:r.children}),n.return=t,n.sibling=null,e!==null&&(s=t.deletions,s===null?(t.deletions=[e],t.flags|=16):s.push(e)),t.child=n,t.memoizedState=null,n)}function Ac(e,t){return t=jc({mode:`visible`,children:t},e.mode),t.return=e,e.child=t}function jc(e,t){return e=hi(22,e,null,t),e.lanes=0,e}function Mc(e,t,n){return Ga(t,e.child,null,n),e=Ac(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Nc(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),ra(e.return,t,n)}function Pc(e,t,n,r,i,a){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:i,treeForkCount:a}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=r,o.tail=n,o.tailMode=i,o.treeForkCount=a)}function Fc(e,t,n){var r=t.pendingProps,i=r.revealOrder,a=r.tail;r=r.children;var o=vo.current,s=!!(o&2);if(s?(o=o&1|2,t.flags|=128):o&=1,fe(vo,o),dc(e,t,r,n),r=M?ki:0,!s&&e!==null&&e.flags&128)a:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Nc(e,n,t);else if(e.tag===19)Nc(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break a;for(;e.sibling===null;){if(e.return===null||e.return===t)break a;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(i){case`forwards`:for(n=t.child,i=null;n!==null;)e=n.alternate,e!==null&&yo(e)===null&&(i=n),n=n.sibling;n=i,n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null),Pc(t,!1,i,n,a,r);break;case`backwards`:case`unstable_legacy-backwards`:for(n=null,i=t.child,t.child=null;i!==null;){if(e=i.alternate,e!==null&&yo(e)===null){t.child=i;break}e=i.sibling,i.sibling=n,n=i,i=e}Pc(t,!0,n,null,a,r);break;case`together`:Pc(t,!1,null,null,void 0,r);break;default:t.memoizedState=null}return t.child}function Ic(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),Ql|=t.lanes,(n&t.childLanes)===0){if(e!==null){if(aa(e,t,n,!1),(n&t.childLanes)===0)return null}else return null}if(e!==null&&t.child!==e.child)throw Error(i(153));if(t.child!==null){for(e=t.child,n=_i(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=_i(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Lc(e,t){return(e.lanes&t)!==0||(e=e.dependencies,!!(e!==null&&oa(e)))}function Rc(e,t,n){switch(t.tag){case 3:_e(t,t.stateNode.containerInfo),ta(t,ma,e.memoizedState.cache),Yi();break;case 27:case 5:ye(t);break;case 4:_e(t,t.stateNode.containerInfo);break;case 10:ta(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,mo(t),null;break;case 13:var r=t.memoizedState;if(r!==null)return r.dehydrated===null?(n&t.child.childLanes)===0?(po(t),e=Ic(e,t,n),e===null?null:e.sibling):kc(e,t,n):(po(t),t.flags|=128,null);po(t);break;case 19:var i=!!(e.flags&128);if(r=(n&t.childLanes)!==0,r||=(aa(e,t,n,!1),(n&t.childLanes)!==0),i){if(r)return Fc(e,t,n);t.flags|=128}if(i=t.memoizedState,i!==null&&(i.rendering=null,i.tail=null,i.lastEffect=null),fe(vo,vo.current),r)break;return null;case 22:return t.lanes=0,hc(e,t,n,t.pendingProps);case 24:ta(t,ma,e.memoizedState.cache)}return Ic(e,t,n)}function zc(e,t,n){if(e!==null){if(e.memoizedProps!==t.pendingProps)uc=!0;else{if(!Lc(e,n)&&!(t.flags&128))return uc=!1,Rc(e,t,n);uc=!!(e.flags&131072)}}else uc=!1,M&&t.flags&1048576&&Ii(t,ki,t.index);switch(t.lanes=0,t.tag){case 16:a:{var r=t.pendingProps;if(e=Fa(t.elementType),t.type=e,typeof e==`function`)gi(e)?(r=$s(e,r),t.tag=1,t=wc(null,t,e,r,n)):(t.tag=0,t=Sc(null,t,e,r,n));else{if(e!=null){var a=e.$$typeof;if(a===w){t.tag=11,t=fc(null,t,e,r,n);break a}if(a===ee){t.tag=14,t=pc(null,t,e,r,n);break a}}throw t=ae(e)||e,Error(i(306,t,``))}}return t;case 0:return Sc(e,t,t.type,t.pendingProps,n);case 1:return r=t.type,a=$s(r,t.pendingProps),wc(e,t,r,a,n);case 3:a:{if(_e(t,t.stateNode.containerInfo),e===null)throw Error(i(387));r=t.pendingProps;var o=t.memoizedState;a=o.element,Ya(e,t),no(t,r,null,n);var s=t.memoizedState;if(r=s.cache,ta(t,ma,r),r!==o.cache&&ia(t,[ma],n,!0),to(),r=s.element,o.isDehydrated){if(o={element:r,isDehydrated:!1,cache:s.cache},t.updateQueue.baseState=o,t.memoizedState=o,t.flags&256){t=Tc(e,t,r,n);break a}if(r!==a){a=Ti(Error(i(424)),t),Zi(a),t=Tc(e,t,r,n);break a}switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName===`HTML`?e.ownerDocument.body:e}for(Vi=_f(e.firstChild),Bi=t,M=!0,Hi=null,Ui=!0,n=Ka(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling}else{if(Yi(),r===a){t=Ic(e,t,n);break a}dc(e,t,r,n)}t=t.child}return t;case 26:return xc(e,t),e===null?(n=Rf(t.type,null,t.pendingProps,null))?t.memoizedState=n:M||(n=t.type,e=t.pendingProps,r=Yd(he.current).createElement(n),r[mt]=t,r[ht]=e,Ud(r,n,e),Dt(r),t.stateNode=r):t.memoizedState=Rf(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return ye(t),e===null&&M&&(r=t.stateNode=xf(t.type,t.pendingProps,he.current),Bi=t,Ui=!0,a=Vi,sf(t.type)?(vf=a,Vi=_f(r.firstChild)):Vi=a),dc(e,t,t.pendingProps.children,n),xc(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&M&&((a=r=Vi)&&(r=df(r,t.type,t.pendingProps,Ui),r===null?a=!1:(t.stateNode=r,Bi=t,Vi=_f(r.firstChild),Ui=!1,a=!0)),a||Gi(t)),ye(t),a=t.type,o=t.pendingProps,s=e===null?null:e.memoizedProps,r=o.children,Qd(a,o)?r=null:s!==null&&Qd(a,s)&&(t.flags|=32),t.memoizedState!==null&&(a=Mo(e,t,Fo,null,null,n),sp._currentValue=a),xc(e,t),dc(e,t,r,n),t.child;case 6:return e===null&&M&&((e=n=Vi)&&(n=ff(n,t.pendingProps,Ui),n===null?e=!1:(t.stateNode=n,Bi=t,Vi=null,e=!0)),e||Gi(t)),null;case 13:return kc(e,t,n);case 4:return _e(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=Ga(t,null,r,n):dc(e,t,r,n),t.child;case 11:return fc(e,t,t.type,t.pendingProps,n);case 7:return dc(e,t,t.pendingProps,n),t.child;case 8:return dc(e,t,t.pendingProps.children,n),t.child;case 12:return dc(e,t,t.pendingProps.children,n),t.child;case 10:return r=t.pendingProps,ta(t,t.type,r.value),dc(e,t,r.children,n),t.child;case 9:return a=t.type._context,r=t.pendingProps.children,sa(t),a=ca(a),r=r(a),t.flags|=1,dc(e,t,r,n),t.child;case 14:return pc(e,t,t.type,t.pendingProps,n);case 15:return mc(e,t,t.type,t.pendingProps,n);case 19:return Fc(e,t,n);case 31:return bc(e,t,n);case 22:return hc(e,t,n,t.pendingProps);case 24:return sa(t),r=ca(ma),e===null?(a=Ea(),a===null&&(a=Wl,o=ha(),a.pooledCache=o,o.refCount++,o!==null&&(a.pooledCacheLanes|=n),a=o),t.memoizedState={parent:r,cache:a},Ja(t),ta(t,ma,a)):((e.lanes&n)!==0&&(Ya(e,t),no(t,null,null,n),to()),a=e.memoizedState,o=t.memoizedState,a.parent===r?(r=o.cache,ta(t,ma,r),r!==a.cache&&ia(t,[ma],n,!0)):(a={parent:r,cache:r},t.memoizedState=a,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=a),ta(t,ma,r))),dc(e,t,t.pendingProps.children,n),t.child;case 29:throw t.pendingProps}throw Error(i(156,t.tag))}function Bc(e){e.flags|=4}function Vc(e,t,n,r,i){if((t=!!(e.mode&32))&&(t=!1),t){if(e.flags|=16777216,(i&335544128)===i){if(e.stateNode.complete)e.flags|=8192;else if(ju())e.flags|=8192;else throw Ia=Ma,Aa}}else e.flags&=-16777217}function Hc(e,t){if(t.type!==`stylesheet`||t.state.loading&4)e.flags&=-16777217;else if(e.flags|=16777216,!$f(t)){if(ju())e.flags|=8192;else throw Ia=Ma,Aa}}function Uc(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag===22?536870912:nt(),e.lanes|=t,nu|=t)}function Wc(e,t){if(!M)switch(e.tailMode){case`hidden`:t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case`collapsed`:n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function L(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags&65011712,r|=i.flags&65011712,i.return=e,i=i.sibling;else for(i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags,r|=i.flags,i.return=e,i=i.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function Gc(e,t,n){var r=t.pendingProps;switch(Ri(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return L(t),null;case 1:return L(t),null;case 3:return n=t.stateNode,r=null,e!==null&&(r=e.memoizedState.cache),t.memoizedState.cache!==r&&(t.flags|=2048),na(ma),ve(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(Ji(t)?Bc(t):e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Xi())),L(t),null;case 26:var a=t.type,o=t.memoizedState;return e===null?(Bc(t),o===null?(L(t),Vc(t,a,null,r,n)):(L(t),Hc(t,o))):o?o===e.memoizedState?(L(t),t.flags&=-16777217):(Bc(t),L(t),Hc(t,o)):(e=e.memoizedProps,e!==r&&Bc(t),L(t),Vc(t,a,e,r,n)),null;case 27:if(be(t),n=he.current,a=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&Bc(t);else{if(!r){if(t.stateNode===null)throw Error(i(166));return L(t),null}e=pe.current,Ji(t)?Ki(t,e):(e=xf(a,r,n),t.stateNode=e,Bc(t))}return L(t),null;case 5:if(be(t),a=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&Bc(t);else{if(!r){if(t.stateNode===null)throw Error(i(166));return L(t),null}if(o=pe.current,Ji(t))Ki(t,o);else{var s=Yd(he.current);switch(o){case 1:o=s.createElementNS(`http://www.w3.org/2000/svg`,a);break;case 2:o=s.createElementNS(`http://www.w3.org/1998/Math/MathML`,a);break;default:switch(a){case`svg`:o=s.createElementNS(`http://www.w3.org/2000/svg`,a);break;case`math`:o=s.createElementNS(`http://www.w3.org/1998/Math/MathML`,a);break;case`script`:o=s.createElement(`div`),o.innerHTML=`<script><\/script>`,o=o.removeChild(o.firstChild);break;case`select`:o=typeof r.is==`string`?s.createElement(`select`,{is:r.is}):s.createElement(`select`),r.multiple?o.multiple=!0:r.size&&(o.size=r.size);break;default:o=typeof r.is==`string`?s.createElement(a,{is:r.is}):s.createElement(a)}}o[mt]=t,o[ht]=r;a:for(s=t.child;s!==null;){if(s.tag===5||s.tag===6)o.appendChild(s.stateNode);else if(s.tag!==4&&s.tag!==27&&s.child!==null){s.child.return=s,s=s.child;continue}if(s===t)break a;for(;s.sibling===null;){if(s.return===null||s.return===t)break a;s=s.return}s.sibling.return=s.return,s=s.sibling}t.stateNode=o;a:switch(Ud(o,a,r),a){case`button`:case`input`:case`select`:case`textarea`:r=!!r.autoFocus;break a;case`img`:r=!0;break a;default:r=!1}r&&Bc(t)}}return L(t),Vc(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,n),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==r&&Bc(t);else{if(typeof r!=`string`&&t.stateNode===null)throw Error(i(166));if(e=he.current,Ji(t)){if(e=t.stateNode,n=t.memoizedProps,r=null,a=Bi,a!==null)switch(a.tag){case 27:case 5:r=a.memoizedProps}e[mt]=t,e=!!(e.nodeValue===n||r!==null&&!0===r.suppressHydrationWarning||Bd(e.nodeValue,n)),e||Gi(t,!0)}else e=Yd(e).createTextNode(r),e[mt]=t,t.stateNode=e}return L(t),null;case 31:if(n=t.memoizedState,e===null||e.memoizedState!==null){if(r=Ji(t),n!==null){if(e===null){if(!r)throw Error(i(318));if(e=t.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(557));e[mt]=t}else Yi(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;L(t),e=!1}else n=Xi(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=n),e=!0;if(!e)return t.flags&256?(_o(t),t):(_o(t),null);if(t.flags&128)throw Error(i(558))}return L(t),null;case 13:if(r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(a=Ji(t),r!==null&&r.dehydrated!==null){if(e===null){if(!a)throw Error(i(318));if(a=t.memoizedState,a=a===null?null:a.dehydrated,!a)throw Error(i(317));a[mt]=t}else Yi(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;L(t),a=!1}else a=Xi(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=a),a=!0;if(!a)return t.flags&256?(_o(t),t):(_o(t),null)}return _o(t),t.flags&128?(t.lanes=n,t):(n=r!==null,e=e!==null&&e.memoizedState!==null,n&&(r=t.child,a=null,r.alternate!==null&&r.alternate.memoizedState!==null&&r.alternate.memoizedState.cachePool!==null&&(a=r.alternate.memoizedState.cachePool.pool),o=null,r.memoizedState!==null&&r.memoizedState.cachePool!==null&&(o=r.memoizedState.cachePool.pool),o!==a&&(r.flags|=2048)),n!==e&&n&&(t.child.flags|=8192),Uc(t,t.updateQueue),L(t),null);case 4:return ve(),e===null&&Ad(t.stateNode.containerInfo),L(t),null;case 10:return na(t.type),L(t),null;case 19:if(de(vo),r=t.memoizedState,r===null)return L(t),null;if(a=!!(t.flags&128),o=r.rendering,o===null){if(a)Wc(r,!1);else{if(Zl!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(o=yo(e),o!==null){for(t.flags|=128,Wc(r,!1),e=o.updateQueue,t.updateQueue=e,Uc(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)vi(n,e),n=n.sibling;return fe(vo,vo.current&1|2),M&&Fi(t,r.treeForkCount),t.child}e=e.sibling}r.tail!==null&&Ne()>cu&&(t.flags|=128,a=!0,Wc(r,!1),t.lanes=4194304)}}else{if(!a){if(e=yo(o),e!==null){if(t.flags|=128,a=!0,e=e.updateQueue,t.updateQueue=e,Uc(t,e),Wc(r,!0),r.tail===null&&r.tailMode===`hidden`&&!o.alternate&&!M)return L(t),null}else 2*Ne()-r.renderingStartTime>cu&&n!==536870912&&(t.flags|=128,a=!0,Wc(r,!1),t.lanes=4194304)}r.isBackwards?(o.sibling=t.child,t.child=o):(e=r.last,e===null?t.child=o:e.sibling=o,r.last=o)}return r.tail===null?(L(t),null):(e=r.tail,r.rendering=e,r.tail=e.sibling,r.renderingStartTime=Ne(),e.sibling=null,n=vo.current,fe(vo,a?n&1|2:n&1),M&&Fi(t,r.treeForkCount),e);case 22:case 23:return _o(t),lo(),r=t.memoizedState!==null,e===null?r&&(t.flags|=8192):e.memoizedState!==null!==r&&(t.flags|=8192),r?n&536870912&&!(t.flags&128)&&(L(t),t.subtreeFlags&6&&(t.flags|=8192)):L(t),n=t.updateQueue,n!==null&&Uc(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),r=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(r=t.memoizedState.cachePool.pool),r!==n&&(t.flags|=2048),e!==null&&de(Ta),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),na(ma),L(t),null;case 25:return null;case 30:return null}throw Error(i(156,t.tag))}function Kc(e,t){switch(Ri(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return na(ma),ve(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return be(t),null;case 31:if(t.memoizedState!==null){if(_o(t),t.alternate===null)throw Error(i(340));Yi()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(_o(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(i(340));Yi()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return de(vo),null;case 4:return ve(),null;case 10:return na(t.type),null;case 22:case 23:return _o(t),lo(),e!==null&&de(Ta),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return na(ma),null;case 25:return null;default:return null}}function qc(e,t){switch(Ri(t),t.tag){case 3:na(ma),ve();break;case 26:case 27:case 5:be(t);break;case 4:ve();break;case 31:t.memoizedState!==null&&_o(t);break;case 13:_o(t);break;case 19:de(vo);break;case 10:na(t.type);break;case 22:case 23:_o(t),lo(),e!==null&&de(Ta);break;case 24:na(ma)}}function Jc(e,t){try{var n=t.updateQueue,r=n===null?null:n.lastEffect;if(r!==null){var i=r.next;n=i;do{if((n.tag&e)===e){r=void 0;var a=n.create,o=n.inst;r=a(),o.destroy=r}n=n.next}while(n!==i)}}catch(e){Qu(t,t.return,e)}}function Yc(e,t,n){try{var r=t.updateQueue,i=r===null?null:r.lastEffect;if(i!==null){var a=i.next;r=a;do{if((r.tag&e)===e){var o=r.inst,s=o.destroy;if(s!==void 0){o.destroy=void 0,i=t;var c=n,l=s;try{l()}catch(e){Qu(i,c,e)}}}r=r.next}while(r!==a)}}catch(e){Qu(t,t.return,e)}}function R(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{io(t,n)}catch(t){Qu(e,e.return,t)}}}function Xc(e,t,n){n.props=$s(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(n){Qu(e,t,n)}}function z(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var r=e.stateNode;break;case 30:r=e.stateNode;break;default:r=e.stateNode}typeof n==`function`?e.refCleanup=n(r):n.current=r}}catch(n){Qu(e,t,n)}}function Zc(e,t){var n=e.ref,r=e.refCleanup;if(n!==null){if(typeof r==`function`)try{r()}catch(n){Qu(e,t,n)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n==`function`)try{n(null)}catch(n){Qu(e,t,n)}else n.current=null}}function Qc(e){var t=e.type,n=e.memoizedProps,r=e.stateNode;try{a:switch(t){case`button`:case`input`:case`select`:case`textarea`:n.autoFocus&&r.focus();break a;case`img`:n.src?r.src=n.src:n.srcSet&&(r.srcset=n.srcSet)}}catch(t){Qu(e,e.return,t)}}function $c(e,t,n){try{var r=e.stateNode;Wd(r,e.type,n,t),r[ht]=t}catch(t){Qu(e,e.return,t)}}function el(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&sf(e.type)||e.tag===4}function B(e){a:for(;;){for(;e.sibling===null;){if(e.return===null||el(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&sf(e.type)||e.flags&2||e.child===null||e.tag===4)continue a;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function tl(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n).insertBefore(e,t):(t=n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n,t.appendChild(e),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=cn));else if(r!==4&&(r===27&&sf(e.type)&&(n=e.stateNode,t=null),e=e.child,e!==null))for(tl(e,t,n),e=e.sibling;e!==null;)tl(e,t,n),e=e.sibling}function nl(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(r===27&&sf(e.type)&&(n=e.stateNode),e=e.child,e!==null))for(nl(e,t,n),e=e.sibling;e!==null;)nl(e,t,n),e=e.sibling}function rl(e){var t=e.stateNode,n=e.memoizedProps;try{for(var r=e.type,i=t.attributes;i.length;)t.removeAttributeNode(i[0]);Ud(t,r,n),t[mt]=e,t[ht]=n}catch(t){Qu(e,e.return,t)}}var il=!1,al=!1,ol=!1,sl=typeof WeakSet==`function`?WeakSet:Set,cl=null;function ll(e,t){if(e=e.containerInfo,qd=gp,e=Pr(e),Fr(e)){if(`selectionStart`in e)var n={start:e.selectionStart,end:e.selectionEnd};else a:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var a=r.anchorOffset,o=r.focusNode;r=r.focusOffset;try{n.nodeType,o.nodeType}catch{n=null;break a}var s=0,c=-1,l=-1,u=0,d=0,f=e,p=null;b:for(;;){for(var m;f!==n||a!==0&&f.nodeType!==3||(c=s+a),f!==o||r!==0&&f.nodeType!==3||(l=s+r),f.nodeType===3&&(s+=f.nodeValue.length),(m=f.firstChild)!==null;)p=f,f=m;for(;;){if(f===e)break b;if(p===n&&++u===a&&(c=s),p===o&&++d===r&&(l=s),(m=f.nextSibling)!==null)break;f=p,p=f.parentNode}f=m}n=c===-1||l===-1?null:{start:c,end:l}}else n=null}n||={start:0,end:0}}else n=null;for(Jd={focusedElem:e,selectionRange:n},gp=!1,cl=t;cl!==null;)if(t=cl,e=t.child,t.subtreeFlags&1028&&e!==null)e.return=t,cl=e;else for(;cl!==null;){switch(t=cl,o=t.alternate,e=t.flags,t.tag){case 0:if(e&4&&(e=t.updateQueue,e=e===null?null:e.events,e!==null))for(n=0;n<e.length;n++)a=e[n],a.ref.impl=a.nextImpl;break;case 11:case 15:break;case 1:if(e&1024&&o!==null){e=void 0,n=t,a=o.memoizedProps,o=o.memoizedState,r=n.stateNode;try{var h=$s(n.type,a);e=r.getSnapshotBeforeUpdate(h,o),r.__reactInternalSnapshotBeforeUpdate=e}catch(e){Qu(n,n.return,e)}}break;case 3:if(e&1024){if(e=t.stateNode.containerInfo,n=e.nodeType,n===9)uf(e);else if(n===1)switch(e.nodeName){case`HEAD`:case`HTML`:case`BODY`:uf(e);break;default:e.textContent=``}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if(e&1024)throw Error(i(163))}if(e=t.sibling,e!==null){e.return=t.return,cl=e;break}cl=t.return}}function ul(e,t,n){var r=n.flags;switch(n.tag){case 0:case 11:case 15:Tl(e,n),r&4&&Jc(5,n);break;case 1:if(Tl(e,n),r&4){if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(e){Qu(n,n.return,e)}else{var i=$s(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(i,t,e.__reactInternalSnapshotBeforeUpdate)}catch(e){Qu(n,n.return,e)}}}r&64&&R(n),r&512&&z(n,n.return);break;case 3:if(Tl(e,n),r&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{io(e,t)}catch(e){Qu(n,n.return,e)}}break;case 27:t===null&&r&4&&rl(n);case 26:case 5:Tl(e,n),t===null&&r&4&&Qc(n),r&512&&z(n,n.return);break;case 12:Tl(e,n);break;case 31:Tl(e,n),r&4&&gl(e,n);break;case 13:Tl(e,n),r&4&&_l(e,n),r&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=nd.bind(null,n),gf(e,n))));break;case 22:if(r=n.memoizedState!==null||il,!r){t=t!==null&&t.memoizedState!==null||al,i=il;var a=al;il=r,(al=t)&&!a?Dl(e,n,!!(n.subtreeFlags&8772)):Tl(e,n),il=i,al=a}break;case 30:break;default:Tl(e,n)}}function dl(e){var t=e.alternate;t!==null&&(e.alternate=null,dl(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&St(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var fl=null,pl=!1;function ml(e,t,n){for(n=n.child;n!==null;)hl(e,t,n),n=n.sibling}function hl(e,t,n){if(Ue&&typeof Ue.onCommitFiberUnmount==`function`)try{Ue.onCommitFiberUnmount(He,n)}catch{}switch(n.tag){case 26:al||Zc(n,t),ml(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:al||Zc(n,t);var r=fl,i=pl;sf(n.type)&&(fl=n.stateNode,pl=!1),ml(e,t,n),Sf(n.stateNode),fl=r,pl=i;break;case 5:al||Zc(n,t);case 6:if(r=fl,i=pl,fl=null,ml(e,t,n),fl=r,pl=i,fl!==null){if(pl)try{(fl.nodeType===9?fl.body:fl.nodeName===`HTML`?fl.ownerDocument.body:fl).removeChild(n.stateNode)}catch(e){Qu(n,t,e)}else try{fl.removeChild(n.stateNode)}catch(e){Qu(n,t,e)}}break;case 18:fl!==null&&(pl?(e=fl,cf(e.nodeType===9?e.body:e.nodeName===`HTML`?e.ownerDocument.body:e,n.stateNode),Hp(e)):cf(fl,n.stateNode));break;case 4:r=fl,i=pl,fl=n.stateNode.containerInfo,pl=!0,ml(e,t,n),fl=r,pl=i;break;case 0:case 11:case 14:case 15:Yc(2,n,t),al||Yc(4,n,t),ml(e,t,n);break;case 1:al||(Zc(n,t),r=n.stateNode,typeof r.componentWillUnmount==`function`&&Xc(n,t,r)),ml(e,t,n);break;case 21:ml(e,t,n);break;case 22:al=(r=al)||n.memoizedState!==null,ml(e,t,n),al=r;break;default:ml(e,t,n)}}function gl(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{Hp(e)}catch(e){Qu(t,t.return,e)}}}function _l(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{Hp(e)}catch(e){Qu(t,t.return,e)}}function vl(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new sl),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new sl),t;default:throw Error(i(435,e.tag))}}function yl(e,t){var n=vl(e);t.forEach(function(t){if(!n.has(t)){n.add(t);var r=rd.bind(null,e,t);t.then(r,r)}})}function bl(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var a=n[r],o=e,s=t,c=s;a:for(;c!==null;){switch(c.tag){case 27:if(sf(c.type)){fl=c.stateNode,pl=!1;break a}break;case 5:fl=c.stateNode,pl=!1;break a;case 3:case 4:fl=c.stateNode.containerInfo,pl=!0;break a}c=c.return}if(fl===null)throw Error(i(160));hl(o,s,a),fl=null,pl=!1,o=a.alternate,o!==null&&(o.return=null),a.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)Sl(t,e),t=t.sibling}var xl=null;function Sl(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:bl(t,e),Cl(e),r&4&&(Yc(3,e,e.return),Jc(3,e),Yc(5,e,e.return));break;case 1:bl(t,e),Cl(e),r&512&&(al||n===null||Zc(n,n.return)),r&64&&il&&(e=e.updateQueue,e!==null&&(r=e.callbacks,r!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?r:n.concat(r))));break;case 26:var a=xl;if(bl(t,e),Cl(e),r&512&&(al||n===null||Zc(n,n.return)),r&4){var o=n===null?null:n.memoizedState;if(r=e.memoizedState,n===null){if(r===null){if(e.stateNode===null){a:{r=e.type,n=e.memoizedProps,a=a.ownerDocument||a;b:switch(r){case`title`:o=a.getElementsByTagName(`title`)[0],(!o||o[xt]||o[mt]||o.namespaceURI===`http://www.w3.org/2000/svg`||o.hasAttribute(`itemprop`))&&(o=a.createElement(r),a.head.insertBefore(o,a.querySelector(`head > title`))),Ud(o,r,n),o[mt]=e,Dt(o),r=o;break a;case`link`:var s=Xf(`link`,`href`,a).get(r+(n.href||``));if(s){for(var c=0;c<s.length;c++)if(o=s[c],o.getAttribute(`href`)===(n.href==null||n.href===``?null:n.href)&&o.getAttribute(`rel`)===(n.rel==null?null:n.rel)&&o.getAttribute(`title`)===(n.title==null?null:n.title)&&o.getAttribute(`crossorigin`)===(n.crossOrigin==null?null:n.crossOrigin)){s.splice(c,1);break b}}o=a.createElement(r),Ud(o,r,n),a.head.appendChild(o);break;case`meta`:if(s=Xf(`meta`,`content`,a).get(r+(n.content||``))){for(c=0;c<s.length;c++)if(o=s[c],o.getAttribute(`content`)===(n.content==null?null:``+n.content)&&o.getAttribute(`name`)===(n.name==null?null:n.name)&&o.getAttribute(`property`)===(n.property==null?null:n.property)&&o.getAttribute(`http-equiv`)===(n.httpEquiv==null?null:n.httpEquiv)&&o.getAttribute(`charset`)===(n.charSet==null?null:n.charSet)){s.splice(c,1);break b}}o=a.createElement(r),Ud(o,r,n),a.head.appendChild(o);break;default:throw Error(i(468,r))}o[mt]=e,Dt(o),r=o}e.stateNode=r}else Zf(a,e.type,e.stateNode)}else e.stateNode=Gf(a,r,e.memoizedProps)}else o===r?r===null&&e.stateNode!==null&&$c(e,e.memoizedProps,n.memoizedProps):(o===null?n.stateNode!==null&&(n=n.stateNode,n.parentNode.removeChild(n)):o.count--,r===null?Zf(a,e.type,e.stateNode):Gf(a,r,e.memoizedProps))}break;case 27:bl(t,e),Cl(e),r&512&&(al||n===null||Zc(n,n.return)),n!==null&&r&4&&$c(e,e.memoizedProps,n.memoizedProps);break;case 5:if(bl(t,e),Cl(e),r&512&&(al||n===null||Zc(n,n.return)),e.flags&32){a=e.stateNode;try{$t(a,``)}catch(t){Qu(e,e.return,t)}}r&4&&e.stateNode!=null&&(a=e.memoizedProps,$c(e,a,n===null?a:n.memoizedProps)),r&1024&&(ol=!0);break;case 6:if(bl(t,e),Cl(e),r&4){if(e.stateNode===null)throw Error(i(162));r=e.memoizedProps,n=e.stateNode;try{n.nodeValue=r}catch(t){Qu(e,e.return,t)}}break;case 3:if(Yf=null,a=xl,xl=Tf(t.containerInfo),bl(t,e),xl=a,Cl(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{Hp(t.containerInfo)}catch(t){Qu(e,e.return,t)}ol&&(ol=!1,wl(e));break;case 4:r=xl,xl=Tf(e.stateNode.containerInfo),bl(t,e),Cl(e),xl=r;break;case 12:bl(t,e),Cl(e);break;case 31:bl(t,e),Cl(e),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,yl(e,r)));break;case 13:bl(t,e),Cl(e),e.child.flags&8192&&e.memoizedState!==null!=(n!==null&&n.memoizedState!==null)&&(ou=Ne()),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,yl(e,r)));break;case 22:a=e.memoizedState!==null;var l=n!==null&&n.memoizedState!==null,u=il,d=al;if(il=u||a,al=d||l,bl(t,e),al=d,il=u,Cl(e),r&8192)a:for(t=e.stateNode,t._visibility=a?t._visibility&-2:t._visibility|1,a&&(n===null||l||il||al||El(e)),n=null,t=e;;){if(t.tag===5||t.tag===26){if(n===null){l=n=t;try{if(o=l.stateNode,a)s=o.style,typeof s.setProperty==`function`?s.setProperty(`display`,`none`,`important`):s.display=`none`;else{c=l.stateNode;var f=l.memoizedProps.style,p=f!=null&&f.hasOwnProperty(`display`)?f.display:null;c.style.display=p==null||typeof p==`boolean`?``:(``+p).trim()}}catch(e){Qu(l,l.return,e)}}}else if(t.tag===6){if(n===null){l=t;try{l.stateNode.nodeValue=a?``:l.memoizedProps}catch(e){Qu(l,l.return,e)}}}else if(t.tag===18){if(n===null){l=t;try{var m=l.stateNode;a?lf(m,!0):lf(l.stateNode,!1)}catch(e){Qu(l,l.return,e)}}}else if((t.tag!==22&&t.tag!==23||t.memoizedState===null||t===e)&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break a;for(;t.sibling===null;){if(t.return===null||t.return===e)break a;n===t&&(n=null),t=t.return}n===t&&(n=null),t.sibling.return=t.return,t=t.sibling}r&4&&(r=e.updateQueue,r!==null&&(n=r.retryQueue,n!==null&&(r.retryQueue=null,yl(e,n))));break;case 19:bl(t,e),Cl(e),r&4&&(r=e.updateQueue,r!==null&&(e.updateQueue=null,yl(e,r)));break;case 30:break;case 21:break;default:bl(t,e),Cl(e)}}function Cl(e){var t=e.flags;if(t&2){try{for(var n,r=e.return;r!==null;){if(el(r)){n=r;break}r=r.return}if(n==null)throw Error(i(160));switch(n.tag){case 27:var a=n.stateNode;nl(e,B(e),a);break;case 5:var o=n.stateNode;n.flags&32&&($t(o,``),n.flags&=-33),nl(e,B(e),o);break;case 3:case 4:var s=n.stateNode.containerInfo;tl(e,B(e),s);break;default:throw Error(i(161))}}catch(t){Qu(e,e.return,t)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function wl(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;wl(t),t.tag===5&&t.flags&1024&&t.stateNode.reset(),e=e.sibling}}function Tl(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)ul(e,t.alternate,t),t=t.sibling}function El(e){for(e=e.child;e!==null;){var t=e;switch(t.tag){case 0:case 11:case 14:case 15:Yc(4,t,t.return),El(t);break;case 1:Zc(t,t.return);var n=t.stateNode;typeof n.componentWillUnmount==`function`&&Xc(t,t.return,n),El(t);break;case 27:Sf(t.stateNode);case 26:case 5:Zc(t,t.return),El(t);break;case 22:t.memoizedState===null&&El(t);break;case 30:El(t);break;default:El(t)}e=e.sibling}}function Dl(e,t,n){for(n&&=!!(t.subtreeFlags&8772),t=t.child;t!==null;){var r=t.alternate,i=e,a=t,o=a.flags;switch(a.tag){case 0:case 11:case 15:Dl(i,a,n),Jc(4,a);break;case 1:if(Dl(i,a,n),r=a,i=r.stateNode,typeof i.componentDidMount==`function`)try{i.componentDidMount()}catch(e){Qu(r,r.return,e)}if(r=a,i=r.updateQueue,i!==null){var s=r.stateNode;try{var c=i.shared.hiddenCallbacks;if(c!==null)for(i.shared.hiddenCallbacks=null,i=0;i<c.length;i++)ro(c[i],s)}catch(e){Qu(r,r.return,e)}}n&&o&64&&R(a),z(a,a.return);break;case 27:rl(a);case 26:case 5:Dl(i,a,n),n&&r===null&&o&4&&Qc(a),z(a,a.return);break;case 12:Dl(i,a,n);break;case 31:Dl(i,a,n),n&&o&4&&gl(i,a);break;case 13:Dl(i,a,n),n&&o&4&&_l(i,a);break;case 22:a.memoizedState===null&&Dl(i,a,n),z(a,a.return);break;case 30:break;default:Dl(i,a,n)}t=t.sibling}}function Ol(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&ga(n))}function kl(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&ga(e))}function Al(e,t,n,r){if(t.subtreeFlags&10256)for(t=t.child;t!==null;)jl(e,t,n,r),t=t.sibling}function jl(e,t,n,r){var i=t.flags;switch(t.tag){case 0:case 11:case 15:Al(e,t,n,r),i&2048&&Jc(9,t);break;case 1:Al(e,t,n,r);break;case 3:Al(e,t,n,r),i&2048&&(e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&ga(e)));break;case 12:if(i&2048){Al(e,t,n,r),e=t.stateNode;try{var a=t.memoizedProps,o=a.id,s=a.onPostCommit;typeof s==`function`&&s(o,t.alternate===null?`mount`:`update`,e.passiveEffectDuration,-0)}catch(e){Qu(t,t.return,e)}}else Al(e,t,n,r);break;case 31:Al(e,t,n,r);break;case 13:Al(e,t,n,r);break;case 23:break;case 22:a=t.stateNode,o=t.alternate,t.memoizedState===null?a._visibility&2?Al(e,t,n,r):(a._visibility|=2,Ml(e,t,n,r,!!(t.subtreeFlags&10256)||!1)):a._visibility&2?Al(e,t,n,r):Nl(e,t),i&2048&&Ol(o,t);break;case 24:Al(e,t,n,r),i&2048&&kl(t.alternate,t);break;default:Al(e,t,n,r)}}function Ml(e,t,n,r,i){for(i&&=!!(t.subtreeFlags&10256)||!1,t=t.child;t!==null;){var a=e,o=t,s=n,c=r,l=o.flags;switch(o.tag){case 0:case 11:case 15:Ml(a,o,s,c,i),Jc(8,o);break;case 23:break;case 22:var u=o.stateNode;o.memoizedState===null?(u._visibility|=2,Ml(a,o,s,c,i)):u._visibility&2?Ml(a,o,s,c,i):Nl(a,o),i&&l&2048&&Ol(o.alternate,o);break;case 24:Ml(a,o,s,c,i),i&&l&2048&&kl(o.alternate,o);break;default:Ml(a,o,s,c,i)}t=t.sibling}}function Nl(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,r=t,i=r.flags;switch(r.tag){case 22:Nl(n,r),i&2048&&Ol(r.alternate,r);break;case 24:Nl(n,r),i&2048&&kl(r.alternate,r);break;default:Nl(n,r)}t=t.sibling}}var Pl=8192;function Fl(e,t,n){if(e.subtreeFlags&Pl)for(e=e.child;e!==null;)Il(e,t,n),e=e.sibling}function Il(e,t,n){switch(e.tag){case 26:Fl(e,t,n),e.flags&Pl&&e.memoizedState!==null&&ep(n,xl,e.memoizedState,e.memoizedProps);break;case 5:Fl(e,t,n);break;case 3:case 4:var r=xl;xl=Tf(e.stateNode.containerInfo),Fl(e,t,n),xl=r;break;case 22:e.memoizedState===null&&(r=e.alternate,r!==null&&r.memoizedState!==null?(r=Pl,Pl=16777216,Fl(e,t,n),Pl=r):Fl(e,t,n));break;default:Fl(e,t,n)}}function Ll(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function Rl(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];cl=r,Vl(r,e)}Ll(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)zl(e),e=e.sibling}function zl(e){switch(e.tag){case 0:case 11:case 15:Rl(e),e.flags&2048&&Yc(9,e,e.return);break;case 3:Rl(e);break;case 12:Rl(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Bl(e)):Rl(e);break;default:Rl(e)}}function Bl(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];cl=r,Vl(r,e)}Ll(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:Yc(8,t,t.return),Bl(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,Bl(t));break;default:Bl(t)}e=e.sibling}}function Vl(e,t){for(;cl!==null;){var n=cl;switch(n.tag){case 0:case 11:case 15:Yc(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var r=n.memoizedState.cachePool.pool;r!=null&&r.refCount++}break;case 24:ga(n.memoizedState.cache)}if(r=n.child,r!==null)r.return=n,cl=r;else a:for(n=e;cl!==null;){r=cl;var i=r.sibling,a=r.return;if(dl(r),r===n){cl=null;break a}if(i!==null){i.return=a,cl=i;break a}cl=a}}}var Hl={getCacheForType:function(e){var t=ca(ma),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n},cacheSignal:function(){return ca(ma).controller.signal}},Ul=typeof WeakMap==`function`?WeakMap:Map,V=0,Wl=null,H=null,U=0,Gl=0,Kl=null,ql=!1,Jl=!1,Yl=!1,Xl=0,Zl=0,Ql=0,$l=0,eu=0,tu=0,nu=0,ru=null,iu=null,au=!1,ou=0,su=0,cu=1/0,lu=null,uu=null,du=0,fu=null,pu=null,mu=0,hu=0,gu=null,_u=null,vu=0,yu=null;function bu(){return V&2&&U!==0?U&-U:k.T===null?dt():yd()}function xu(){if(tu===0){if(!(U&536870912)||M){var e=Xe;Xe<<=1,!(Xe&3932160)&&(Xe=262144),tu=e}else tu=536870912}return e=uo.current,e!==null&&(e.flags|=32),tu}function Su(e,t,n){(e===Wl&&(Gl===2||Gl===9)||e.cancelPendingCommit!==null)&&(ku(e,0),Eu(e,U,tu,!1)),it(e,n),(!(V&2)||e!==Wl)&&(e===Wl&&(!(V&2)&&($l|=n),Zl===4&&Eu(e,U,tu,!1)),dd(e))}function Cu(e,t,n){if(V&6)throw Error(i(327));var r=!n&&!(t&127)&&(t&e.expiredLanes)===0||et(e,t),a=r?Lu(e,t):Fu(e,t,!0),o=r;do{if(a===0){Jl&&!r&&Eu(e,t,0,!1);break}if(n=e.current.alternate,o&&!Tu(n)){a=Fu(e,t,!1),o=!1;continue}if(a===2){if(o=t,e.errorRecoveryDisabledLanes&o)var s=0;else s=e.pendingLanes&-536870913,s=s===0?s&536870912?536870912:0:s;if(s!==0){t=s;a:{var c=e;a=ru;var l=c.current.memoizedState.isDehydrated;if(l&&(ku(c,s).flags|=256),s=Fu(c,s,!1),s!==2){if(Yl&&!l){c.errorRecoveryDisabledLanes|=o,$l|=o,a=4;break a}o=iu,iu=a,o!==null&&(iu===null?iu=o:iu.push.apply(iu,o))}a=s}if(o=!1,a!==2)continue}}if(a===1){ku(e,0),Eu(e,t,0,!0);break}a:{switch(r=e,o=a,o){case 0:case 1:throw Error(i(345));case 4:if((t&4194048)!==t)break;case 6:Eu(r,t,tu,!ql);break a;case 2:iu=null;break;case 3:case 5:break;default:throw Error(i(329))}if((t&62914560)===t&&(a=ou+300-Ne(),10<a)){if(Eu(r,t,tu,!ql),$e(r,0,!0)!==0)break a;mu=t,r.timeoutHandle=tf(wu.bind(null,r,n,iu,lu,au,t,tu,$l,nu,ql,o,`Throttled`,-0,0),a);break a}wu(r,n,iu,lu,au,t,tu,$l,nu,ql,o,null,-0,0)}break}while(1);dd(e)}function wu(e,t,n,r,i,a,o,s,c,l,u,d,f,p){if(e.timeoutHandle=-1,d=t.subtreeFlags,d&8192||(d&16785408)==16785408){d={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:cn},Il(t,a,d);var m=(a&62914560)===a?ou-Ne():(a&4194048)===a?su-Ne():0;if(m=np(d,m),m!==null){mu=a,e.cancelPendingCommit=m(Wu.bind(null,e,t,a,n,r,i,o,s,c,u,d,null,f,p)),Eu(e,a,o,!l);return}}Wu(e,t,a,n,r,i,o,s,c)}function Tu(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var r=0;r<n.length;r++){var i=n[r],a=i.getSnapshot;i=i.value;try{if(!kr(a(),i))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Eu(e,t,n,r){t&=~eu,t&=~$l,e.suspendedLanes|=t,e.pingedLanes&=~t,r&&(e.warmLanes|=t),r=e.expirationTimes;for(var i=t;0<i;){var a=31-Ge(i),o=1<<a;r[a]=-1,i&=~o}n!==0&&ot(e,n,t)}function Du(){return V&6?!0:(fd(0,!1),!1)}function Ou(){if(H!==null){if(Gl===0)var e=H.return;else e=H,ea=$i=null,Ro(e),za=null,Ba=0,e=H;for(;e!==null;)qc(e.alternate,e),e=e.return;H=null}}function ku(e,t){var n=e.timeoutHandle;n!==-1&&(e.timeoutHandle=-1,nf(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),mu=0,Ou(),Wl=e,H=n=_i(e.current,null),U=t,Gl=0,Kl=null,ql=!1,Jl=et(e,t),Yl=!1,nu=tu=eu=$l=Ql=Zl=0,iu=ru=null,au=!1,t&8&&(t|=t&32);var r=e.entangledLanes;if(r!==0)for(e=e.entanglements,r&=t;0<r;){var i=31-Ge(r),a=1<<i;t|=e[i],r&=~a}return Xl=t,si(),n}function Au(e,t){N=null,k.H=Gs,t===ka||t===ja?(t=La(),Gl=3):t===Aa?(t=La(),Gl=4):Gl=t===lc?8:typeof t==`object`&&t&&typeof t.then==`function`?6:1,Kl=t,H===null&&(Zl=1,rc(e,Ti(t,e.current)))}function ju(){var e=uo.current;return e===null?!0:(U&4194048)===U?fo===null:(U&62914560)===U||U&536870912?e===fo:!1}function Mu(){var e=k.H;return k.H=Gs,e===null?Gs:e}function Nu(){var e=k.A;return k.A=Hl,e}function Pu(){Zl=4,ql||(U&4194048)!==U&&uo.current!==null||(Jl=!0),!(Ql&134217727)&&!($l&134217727)||Wl===null||Eu(Wl,U,tu,!1)}function Fu(e,t,n){var r=V;V|=2;var i=Mu(),a=Nu();(Wl!==e||U!==t)&&(lu=null,ku(e,t)),t=!1;var o=Zl;a:do try{if(Gl!==0&&H!==null){var s=H,c=Kl;switch(Gl){case 8:Ou(),o=6;break a;case 3:case 2:case 9:case 6:uo.current===null&&(t=!0);var l=Gl;if(Gl=0,Kl=null,Vu(e,s,c,l),n&&Jl){o=0;break a}break;default:l=Gl,Gl=0,Kl=null,Vu(e,s,c,l)}}Iu(),o=Zl;break}catch(t){Au(e,t)}while(1);return t&&e.shellSuspendCounter++,ea=$i=null,V=r,k.H=i,k.A=a,H===null&&(Wl=null,U=0,si()),o}function Iu(){for(;H!==null;)zu(H)}function Lu(e,t){var n=V;V|=2;var r=Mu(),a=Nu();Wl!==e||U!==t?(lu=null,cu=Ne()+500,ku(e,t)):Jl=et(e,t);a:do try{if(Gl!==0&&H!==null){t=H;var o=Kl;b:switch(Gl){case 1:Gl=0,Kl=null,Vu(e,t,o,1);break;case 2:case 9:if(Na(o)){Gl=0,Kl=null,Bu(t);break}t=function(){Gl!==2&&Gl!==9||Wl!==e||(Gl=7),dd(e)},o.then(t,t);break a;case 3:Gl=7;break a;case 4:Gl=5;break a;case 7:Na(o)?(Gl=0,Kl=null,Bu(t)):(Gl=0,Kl=null,Vu(e,t,o,7));break;case 5:var s=null;switch(H.tag){case 26:s=H.memoizedState;case 5:case 27:var c=H;if(s?$f(s):c.stateNode.complete){Gl=0,Kl=null;var l=c.sibling;if(l!==null)H=l;else{var u=c.return;u===null?H=null:(H=u,Hu(u))}break b}}Gl=0,Kl=null,Vu(e,t,o,5);break;case 6:Gl=0,Kl=null,Vu(e,t,o,6);break;case 8:Ou(),Zl=6;break a;default:throw Error(i(462))}}Ru();break}catch(t){Au(e,t)}while(1);return ea=$i=null,k.H=r,k.A=a,V=n,H===null?(Wl=null,U=0,si(),Zl):0}function Ru(){for(;H!==null&&!je();)zu(H)}function zu(e){var t=zc(e.alternate,e,Xl);e.memoizedProps=e.pendingProps,t===null?Hu(e):H=t}function Bu(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=Cc(n,t,t.pendingProps,t.type,void 0,U);break;case 11:t=Cc(n,t,t.pendingProps,t.type.render,t.ref,U);break;case 5:Ro(t);default:qc(n,t),t=H=vi(t,Xl),t=zc(n,t,Xl)}e.memoizedProps=e.pendingProps,t===null?Hu(e):H=t}function Vu(e,t,n,r){ea=$i=null,Ro(t),za=null,Ba=0;var i=t.return;try{if(cc(e,i,t,n,U)){Zl=1,rc(e,Ti(n,e.current)),H=null;return}}catch(t){if(i!==null)throw H=i,t;Zl=1,rc(e,Ti(n,e.current)),H=null;return}t.flags&32768?(M||r===1?e=!0:Jl||U&536870912?e=!1:(ql=e=!0,(r===2||r===9||r===3||r===6)&&(r=uo.current,r!==null&&r.tag===13&&(r.flags|=16384))),Uu(t,e)):Hu(t)}function Hu(e){var t=e;do{if(t.flags&32768){Uu(t,ql);return}e=t.return;var n=Gc(t.alternate,t,Xl);if(n!==null){H=n;return}if(t=t.sibling,t!==null){H=t;return}H=t=e}while(t!==null);Zl===0&&(Zl=5)}function Uu(e,t){do{var n=Kc(e.alternate,e);if(n!==null){n.flags&=32767,H=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){H=e;return}H=e=n}while(e!==null);Zl=6,H=null}function Wu(e,t,n,r,a,o,s,c,l){e.cancelPendingCommit=null;do Yu();while(du!==0);if(V&6)throw Error(i(327));if(t!==null){if(t===e.current)throw Error(i(177));if(o=t.lanes|t.childLanes,o|=oi,at(e,n,o,s,c,l),e===Wl&&(H=Wl=null,U=0),pu=t,fu=e,mu=n,hu=o,gu=a,_u=r,t.subtreeFlags&10256||t.flags&10256?(e.callbackNode=null,e.callbackPriority=0,id(Le,function(){return Xu(),null})):(e.callbackNode=null,e.callbackPriority=0),r=!!(t.flags&13878),t.subtreeFlags&13878||r){r=k.T,k.T=null,a=A.p,A.p=2,s=V,V|=4;try{ll(e,t,n)}finally{V=s,A.p=a,k.T=r}}du=1,Gu(),Ku(),qu()}}function Gu(){if(du===1){du=0;var e=fu,t=pu,n=!!(t.flags&13878);if(t.subtreeFlags&13878||n){n=k.T,k.T=null;var r=A.p;A.p=2;var i=V;V|=4;try{Sl(t,e);var a=Jd,o=Pr(e.containerInfo),s=a.focusedElem,c=a.selectionRange;if(o!==s&&s&&s.ownerDocument&&Nr(s.ownerDocument.documentElement,s)){if(c!==null&&Fr(s)){var l=c.start,u=c.end;if(u===void 0&&(u=l),`selectionStart`in s)s.selectionStart=l,s.selectionEnd=Math.min(u,s.value.length);else{var d=s.ownerDocument||document,f=d&&d.defaultView||window;if(f.getSelection){var p=f.getSelection(),m=s.textContent.length,h=Math.min(c.start,m),g=c.end===void 0?h:Math.min(c.end,m);!p.extend&&h>g&&(o=g,g=h,h=o);var _=Mr(s,h),v=Mr(s,g);if(_&&v&&(p.rangeCount!==1||p.anchorNode!==_.node||p.anchorOffset!==_.offset||p.focusNode!==v.node||p.focusOffset!==v.offset)){var y=d.createRange();y.setStart(_.node,_.offset),p.removeAllRanges(),h>g?(p.addRange(y),p.extend(v.node,v.offset)):(y.setEnd(v.node,v.offset),p.addRange(y))}}}}for(d=[],p=s;p=p.parentNode;)p.nodeType===1&&d.push({element:p,left:p.scrollLeft,top:p.scrollTop});for(typeof s.focus==`function`&&s.focus(),s=0;s<d.length;s++){var b=d[s];b.element.scrollLeft=b.left,b.element.scrollTop=b.top}}gp=!!qd,Jd=qd=null}finally{V=i,A.p=r,k.T=n}}e.current=t,du=2}}function Ku(){if(du===2){du=0;var e=fu,t=pu,n=!!(t.flags&8772);if(t.subtreeFlags&8772||n){n=k.T,k.T=null;var r=A.p;A.p=2;var i=V;V|=4;try{ul(e,t.alternate,t)}finally{V=i,A.p=r,k.T=n}}du=3}}function qu(){if(du===4||du===3){du=0,Me();var e=fu,t=pu,n=mu,r=_u;t.subtreeFlags&10256||t.flags&10256?du=5:(du=0,pu=fu=null,Ju(e,e.pendingLanes));var i=e.pendingLanes;if(i===0&&(uu=null),ut(n),t=t.stateNode,Ue&&typeof Ue.onCommitFiberRoot==`function`)try{Ue.onCommitFiberRoot(He,t,void 0,(t.current.flags&128)==128)}catch{}if(r!==null){t=k.T,i=A.p,A.p=2,k.T=null;try{for(var a=e.onRecoverableError,o=0;o<r.length;o++){var s=r[o];a(s.value,{componentStack:s.stack})}}finally{k.T=t,A.p=i}}mu&3&&Yu(),dd(e),i=e.pendingLanes,n&261930&&i&42?e===yu?vu++:(vu=0,yu=e):vu=0,fd(0,!1)}}function Ju(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,ga(t)))}function Yu(){return Gu(),Ku(),qu(),Xu()}function Xu(){if(du!==5)return!1;var e=fu,t=hu;hu=0;var n=ut(mu),r=k.T,a=A.p;try{A.p=32>n?32:n,k.T=null,n=gu,gu=null;var o=fu,s=mu;if(du=0,pu=fu=null,mu=0,V&6)throw Error(i(331));var c=V;if(V|=4,zl(o.current),jl(o,o.current,s,n),V=c,fd(0,!1),Ue&&typeof Ue.onPostCommitFiberRoot==`function`)try{Ue.onPostCommitFiberRoot(He,o)}catch{}return!0}finally{A.p=a,k.T=r,Ju(e,t)}}function Zu(e,t,n){t=Ti(n,t),t=ac(e.stateNode,t,2),e=Za(e,t,2),e!==null&&(it(e,2),dd(e))}function Qu(e,t,n){if(e.tag===3)Zu(e,e,n);else for(;t!==null;){if(t.tag===3){Zu(t,e,n);break}if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError==`function`||typeof r.componentDidCatch==`function`&&(uu===null||!uu.has(r))){e=Ti(n,e),n=oc(2),r=Za(t,n,2),r!==null&&(sc(n,r,t,e),it(r,2),dd(r));break}}t=t.return}}function $u(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new Ul;var i=new Set;r.set(t,i)}else i=r.get(t),i===void 0&&(i=new Set,r.set(t,i));i.has(n)||(Yl=!0,i.add(n),e=ed.bind(null,e,t,n),t.then(e,e))}function ed(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,Wl===e&&(U&n)===n&&(Zl===4||Zl===3&&(U&62914560)===U&&300>Ne()-ou?!(V&2)&&ku(e,0):eu|=n,nu===U&&(nu=0)),dd(e)}function td(e,t){t===0&&(t=nt()),e=ui(e,t),e!==null&&(it(e,t),dd(e))}function nd(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),td(e,n)}function rd(e,t){var n=0;switch(e.tag){case 31:case 13:var r=e.stateNode,a=e.memoizedState;a!==null&&(n=a.retryLane);break;case 19:r=e.stateNode;break;case 22:r=e.stateNode._retryCache;break;default:throw Error(i(314))}r!==null&&r.delete(t),td(e,n)}function id(e,t){return ke(e,t)}var ad=null,od=null,sd=!1,cd=!1,ld=!1,ud=0;function dd(e){e!==od&&e.next===null&&(od===null?ad=od=e:od=od.next=e),cd=!0,sd||(sd=!0,vd())}function fd(e,t){if(!ld&&cd){ld=!0;do for(var n=!1,r=ad;r!==null;){if(!t){if(e!==0){var i=r.pendingLanes;if(i===0)var a=0;else{var o=r.suspendedLanes,s=r.pingedLanes;a=(1<<31-Ge(42|e)+1)-1,a&=i&~(o&~s),a=a&201326741?a&201326741|1:a?a|2:0}a!==0&&(n=!0,_d(r,a))}else a=U,a=$e(r,r===Wl?a:0,r.cancelPendingCommit!==null||r.timeoutHandle!==-1),!(a&3)||et(r,a)||(n=!0,_d(r,a))}r=r.next}while(n);ld=!1}}function pd(){md()}function md(){cd=sd=!1;var e=0;ud!==0&&ef()&&(e=ud);for(var t=Ne(),n=null,r=ad;r!==null;){var i=r.next,a=hd(r,t);a===0?(r.next=null,n===null?ad=i:n.next=i,i===null&&(od=n)):(n=r,(e!==0||a&3)&&(cd=!0)),r=i}du!==0&&du!==5||fd(e,!1),ud!==0&&(ud=0)}function hd(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,i=e.expirationTimes,a=e.pendingLanes&-62914561;0<a;){var o=31-Ge(a),s=1<<o,c=i[o];c===-1?((s&n)===0||(s&r)!==0)&&(i[o]=tt(s,t)):c<=t&&(e.expiredLanes|=s),a&=~s}if(t=Wl,n=U,n=$e(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r=e.callbackNode,n===0||e===t&&(Gl===2||Gl===9)||e.cancelPendingCommit!==null)return r!==null&&r!==null&&Ae(r),e.callbackNode=null,e.callbackPriority=0;if(!(n&3)||et(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(r!==null&&Ae(r),ut(n)){case 2:case 8:n=Ie;break;case 32:n=Le;break;case 268435456:n=ze;break;default:n=Le}return r=gd.bind(null,e),n=ke(n,r),e.callbackPriority=t,e.callbackNode=n,t}return r!==null&&r!==null&&Ae(r),e.callbackPriority=2,e.callbackNode=null,2}function gd(e,t){if(du!==0&&du!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(Yu()&&e.callbackNode!==n)return null;var r=U;return r=$e(e,e===Wl?r:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r===0?null:(Cu(e,r,t),hd(e,Ne()),e.callbackNode!=null&&e.callbackNode===n?gd.bind(null,e):null)}function _d(e,t){if(Yu())return null;Cu(e,t,!0)}function vd(){af(function(){V&6?ke(Fe,pd):md()})}function yd(){if(ud===0){var e=ya;e===0&&(e=Ye,Ye<<=1,!(Ye&261888)&&(Ye=256)),ud=e}return ud}function bd(e){return e==null||typeof e==`symbol`||typeof e==`boolean`?null:typeof e==`function`?e:sn(``+e)}function xd(e,t){var n=t.ownerDocument.createElement(`input`);return n.name=t.name,n.value=t.value,e.id&&n.setAttribute(`form`,e.id),t.parentNode.insertBefore(n,t),e=new FormData(e),n.parentNode.removeChild(n),e}function Sd(e,t,n,r,i){if(t===`submit`&&n&&n.stateNode===i){var a=bd((i[ht]||null).action),o=r.submitter;o&&(t=(t=o[ht]||null)?bd(t.formAction):o.getAttribute(`formAction`),t!==null&&(a=t,o=null));var s=new kn(`action`,`action`,null,r,i);e.push({event:s,listeners:[{instance:null,listener:function(){if(r.defaultPrevented){if(ud!==0){var e=o?xd(i,o):new FormData(i);js(n,{pending:!0,data:e,method:i.method,action:a},null,e)}}else typeof a==`function`&&(s.preventDefault(),e=o?xd(i,o):new FormData(i),js(n,{pending:!0,data:e,method:i.method,action:a},a,e))},currentTarget:i}]})}}for(var Cd=0;Cd<ti.length;Cd++){var wd=ti[Cd];ni(wd.toLowerCase(),`on`+(wd[0].toUpperCase()+wd.slice(1)))}ni(qr,`onAnimationEnd`),ni(Jr,`onAnimationIteration`),ni(Yr,`onAnimationStart`),ni(`dblclick`,`onDoubleClick`),ni(`focusin`,`onFocus`),ni(`focusout`,`onBlur`),ni(Xr,`onTransitionRun`),ni(Zr,`onTransitionStart`),ni(Qr,`onTransitionCancel`),ni($r,`onTransitionEnd`),jt(`onMouseEnter`,[`mouseout`,`mouseover`]),jt(`onMouseLeave`,[`mouseout`,`mouseover`]),jt(`onPointerEnter`,[`pointerout`,`pointerover`]),jt(`onPointerLeave`,[`pointerout`,`pointerover`]),At(`onChange`,`change click focusin focusout input keydown keyup selectionchange`.split(` `)),At(`onSelect`,`focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange`.split(` `)),At(`onBeforeInput`,[`compositionend`,`keypress`,`textInput`,`paste`]),At(`onCompositionEnd`,`compositionend focusout keydown keypress keyup mousedown`.split(` `)),At(`onCompositionStart`,`compositionstart focusout keydown keypress keyup mousedown`.split(` `)),At(`onCompositionUpdate`,`compositionupdate focusout keydown keypress keyup mousedown`.split(` `));var Td=`abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting`.split(` `),Ed=new Set(`beforetoggle cancel close invalid load scroll scrollend toggle`.split(` `).concat(Td));function Dd(e,t){t=!!(t&4);for(var n=0;n<e.length;n++){var r=e[n],i=r.event;r=r.listeners;a:{var a=void 0;if(t)for(var o=r.length-1;0<=o;o--){var s=r[o],c=s.instance,l=s.currentTarget;if(s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){ri(e)}i.currentTarget=null,a=c}else for(o=0;o<r.length;o++){if(s=r[o],c=s.instance,l=s.currentTarget,s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){ri(e)}i.currentTarget=null,a=c}}}}function W(e,t){var n=t[_t];n===void 0&&(n=t[_t]=new Set);var r=e+`__bubble`;n.has(r)||(jd(t,e,2,!1),n.add(r))}function Od(e,t,n){var r=0;t&&(r|=4),jd(n,e,r,t)}var kd=`_reactListening`+Math.random().toString(36).slice(2);function Ad(e){if(!e[kd]){e[kd]=!0,Ot.forEach(function(t){t!==`selectionchange`&&(Ed.has(t)||Od(t,!1,e),Od(t,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[kd]||(t[kd]=!0,Od(`selectionchange`,!1,t))}}function jd(e,t,n,r){switch(Cp(t)){case 2:var i=_p;break;case 8:i=vp;break;default:i=yp}n=i.bind(null,t,n,e),i=void 0,!vn||t!==`touchstart`&&t!==`touchmove`&&t!==`wheel`||(i=!0),r?i===void 0?e.addEventListener(t,n,!0):e.addEventListener(t,n,{capture:!0,passive:i}):i===void 0?e.addEventListener(t,n,!1):e.addEventListener(t,n,{passive:i})}function Md(e,t,n,r,i){var a=r;if(!(t&1)&&!(t&2)&&r!==null)a:for(;;){if(r===null)return;var s=r.tag;if(s===3||s===4){var c=r.stateNode.containerInfo;if(c===i)break;if(s===4)for(s=r.return;s!==null;){var l=s.tag;if((l===3||l===4)&&s.stateNode.containerInfo===i)return;s=s.return}for(;c!==null;){if(s=Ct(c),s===null)return;if(l=s.tag,l===5||l===6||l===26||l===27){r=a=s;continue a}c=c.parentNode}}r=r.return}hn(function(){var r=a,i=un(n),s=[];a:{var c=ei.get(e);if(c!==void 0){var l=kn,u=e;switch(e){case`keypress`:if(wn(n)===0)break a;case`keydown`:case`keyup`:l=Kn;break;case`focusin`:u=`focus`,l=Rn;break;case`focusout`:u=`blur`,l=Rn;break;case`beforeblur`:case`afterblur`:l=Rn;break;case`click`:if(n.button===2)break a;case`auxclick`:case`dblclick`:case`mousedown`:case`mousemove`:case`mouseup`:case`mouseout`:case`mouseover`:case`contextmenu`:l=In;break;case`drag`:case`dragend`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`dragstart`:case`drop`:l=Ln;break;case`touchcancel`:case`touchend`:case`touchmove`:case`touchstart`:l=Jn;break;case qr:case Jr:case Yr:l=zn;break;case $r:l=Yn;break;case`scroll`:case`scrollend`:l=jn;break;case`wheel`:l=Xn;break;case`copy`:case`cut`:case`paste`:l=Bn;break;case`gotpointercapture`:case`lostpointercapture`:case`pointercancel`:case`pointerdown`:case`pointermove`:case`pointerout`:case`pointerover`:case`pointerup`:l=qn;break;case`toggle`:case`beforetoggle`:l=Zn}var d=!!(t&4),f=!d&&(e===`scroll`||e===`scrollend`),p=d?c===null?null:c+`Capture`:c;d=[];for(var m=r,h;m!==null;){var g=m;if(h=g.stateNode,g=g.tag,g!==5&&g!==26&&g!==27||h===null||p===null||(g=gn(m,p),g!=null&&d.push(Nd(m,g,h))),f)break;m=m.return}0<d.length&&(c=new l(c,u,null,n,i),s.push({event:c,listeners:d}))}}if(!(t&7)){a:{if(c=e===`mouseover`||e===`pointerover`,l=e===`mouseout`||e===`pointerout`,c&&n!==ln&&(u=n.relatedTarget||n.fromElement)&&(Ct(u)||u[gt]))break a;if((l||c)&&(c=i.window===i?i:(c=i.ownerDocument)?c.defaultView||c.parentWindow:window,l?(u=n.relatedTarget||n.toElement,l=r,u=u?Ct(u):null,u!==null&&(f=o(u),d=u.tag,u!==f||d!==5&&d!==27&&d!==6)&&(u=null)):(l=null,u=r),l!==u)){if(d=In,g=`onMouseLeave`,p=`onMouseEnter`,m=`mouse`,(e===`pointerout`||e===`pointerover`)&&(d=qn,g=`onPointerLeave`,p=`onPointerEnter`,m=`pointer`),f=l==null?c:Tt(l),h=u==null?c:Tt(u),c=new d(g,m+`leave`,l,n,i),c.target=f,c.relatedTarget=h,g=null,Ct(i)===r&&(d=new d(p,m+`enter`,u,n,i),d.target=h,d.relatedTarget=f,g=d),f=g,l&&u)b:{for(d=Fd,p=l,m=u,h=0,g=p;g;g=d(g))h++;g=0;for(var _=m;_;_=d(_))g++;for(;0<h-g;)p=d(p),h--;for(;0<g-h;)m=d(m),g--;for(;h--;){if(p===m||m!==null&&p===m.alternate){d=p;break b}p=d(p),m=d(m)}d=null}else d=null;l!==null&&Id(s,c,l,d,!1),u!==null&&f!==null&&Id(s,f,u,d,!0)}}a:{if(c=r?Tt(r):window,l=c.nodeName&&c.nodeName.toLowerCase(),l===`select`||l===`input`&&c.type===`file`)var v=_r;else if(dr(c)){if(vr)v=Dr;else{v=Tr;var y=wr}}else l=c.nodeName,!l||l.toLowerCase()!==`input`||c.type!==`checkbox`&&c.type!==`radio`?r&&rn(r.elementType)&&(v=_r):v=Er;if(v&&=v(e,r)){fr(s,v,n,i);break a}y&&y(e,c,r),e===`focusout`&&r&&c.type===`number`&&r.memoizedProps.value!=null&&Yt(c,`number`,c.value)}switch(y=r?Tt(r):window,e){case`focusin`:(dr(y)||y.contentEditable===`true`)&&(Lr=y,Rr=r,zr=null);break;case`focusout`:zr=Rr=Lr=null;break;case`mousedown`:Br=!0;break;case`contextmenu`:case`mouseup`:case`dragend`:Br=!1,Vr(s,n,i);break;case`selectionchange`:if(Ir)break;case`keydown`:case`keyup`:Vr(s,n,i)}var b;if($n)b:{switch(e){case`compositionstart`:var x=`onCompositionStart`;break b;case`compositionend`:x=`onCompositionEnd`;break b;case`compositionupdate`:x=`onCompositionUpdate`;break b}x=void 0}else sr?ar(e,n)&&(x=`onCompositionEnd`):e===`keydown`&&n.keyCode===229&&(x=`onCompositionStart`);x&&(nr&&n.locale!==`ko`&&(sr||x!==`onCompositionStart`?x===`onCompositionEnd`&&sr&&(b=Cn()):(bn=i,xn=`value`in bn?bn.value:bn.textContent,sr=!0)),y=Pd(r,x),0<y.length&&(x=new Vn(x,e,null,n,i),s.push({event:x,listeners:y}),b?x.data=b:(b=or(n),b!==null&&(x.data=b)))),(b=tr?cr(e,n):lr(e,n))&&(x=Pd(r,`onBeforeInput`),0<x.length&&(y=new Vn(`onBeforeInput`,`beforeinput`,null,n,i),s.push({event:y,listeners:x}),y.data=b)),Sd(s,e,r,n,i)}Dd(s,t)})}function Nd(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Pd(e,t){for(var n=t+`Capture`,r=[];e!==null;){var i=e,a=i.stateNode;if(i=i.tag,i!==5&&i!==26&&i!==27||a===null||(i=gn(e,n),i!=null&&r.unshift(Nd(e,i,a)),i=gn(e,t),i!=null&&r.push(Nd(e,i,a))),e.tag===3)return r;e=e.return}return[]}function Fd(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function Id(e,t,n,r,i){for(var a=t._reactName,o=[];n!==null&&n!==r;){var s=n,c=s.alternate,l=s.stateNode;if(s=s.tag,c!==null&&c===r)break;s!==5&&s!==26&&s!==27||l===null||(c=l,i?(l=gn(n,a),l!=null&&o.unshift(Nd(n,l,c))):i||(l=gn(n,a),l!=null&&o.push(Nd(n,l,c)))),n=n.return}o.length!==0&&e.push({event:t,listeners:o})}var Ld=/\r\n?/g,Rd=/\u0000|\uFFFD/g;function zd(e){return(typeof e==`string`?e:``+e).replace(Ld,`
`).replace(Rd,``)}function Bd(e,t){return t=zd(t),zd(e)===t}function Vd(e,t,n,r,a,o){switch(n){case`children`:typeof r==`string`?t===`body`||t===`textarea`&&r===``||$t(e,r):(typeof r==`number`||typeof r==`bigint`)&&t!==`body`&&$t(e,``+r);break;case`className`:Lt(e,`class`,r);break;case`tabIndex`:Lt(e,`tabindex`,r);break;case`dir`:case`role`:case`viewBox`:case`width`:case`height`:Lt(e,n,r);break;case`style`:nn(e,r,o);break;case`data`:if(t!==`object`){Lt(e,`data`,r);break}case`src`:case`href`:if(r===``&&(t!==`a`||n!==`href`)){e.removeAttribute(n);break}if(r==null||typeof r==`function`||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=sn(``+r),e.setAttribute(n,r);break;case`action`:case`formAction`:if(typeof r==`function`){e.setAttribute(n,`javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')`);break}if(typeof o==`function`&&(n===`formAction`?(t!==`input`&&Vd(e,t,`name`,a.name,a,null),Vd(e,t,`formEncType`,a.formEncType,a,null),Vd(e,t,`formMethod`,a.formMethod,a,null),Vd(e,t,`formTarget`,a.formTarget,a,null)):(Vd(e,t,`encType`,a.encType,a,null),Vd(e,t,`method`,a.method,a,null),Vd(e,t,`target`,a.target,a,null))),r==null||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=sn(``+r),e.setAttribute(n,r);break;case`onClick`:r!=null&&(e.onclick=cn);break;case`onScroll`:r!=null&&W(`scroll`,e);break;case`onScrollEnd`:r!=null&&W(`scrollend`,e);break;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(i(61));if(n=r.__html,n!=null){if(a.children!=null)throw Error(i(60));e.innerHTML=n}}break;case`multiple`:e.multiple=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`muted`:e.muted=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`defaultValue`:case`defaultChecked`:case`innerHTML`:case`ref`:break;case`autoFocus`:break;case`xlinkHref`:if(r==null||typeof r==`function`||typeof r==`boolean`||typeof r==`symbol`){e.removeAttribute(`xlink:href`);break}n=sn(``+r),e.setAttributeNS(`http://www.w3.org/1999/xlink`,`xlink:href`,n);break;case`contentEditable`:case`spellCheck`:case`draggable`:case`value`:case`autoReverse`:case`externalResourcesRequired`:case`focusable`:case`preserveAlpha`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``+r):e.removeAttribute(n);break;case`inert`:case`allowFullScreen`:case`async`:case`autoPlay`:case`controls`:case`default`:case`defer`:case`disabled`:case`disablePictureInPicture`:case`disableRemotePlayback`:case`formNoValidate`:case`hidden`:case`loop`:case`noModule`:case`noValidate`:case`open`:case`playsInline`:case`readOnly`:case`required`:case`reversed`:case`scoped`:case`seamless`:case`itemScope`:r&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``):e.removeAttribute(n);break;case`capture`:case`download`:!0===r?e.setAttribute(n,``):!1!==r&&r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,r):e.removeAttribute(n);break;case`cols`:case`rows`:case`size`:case`span`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`&&!isNaN(r)&&1<=r?e.setAttribute(n,r):e.removeAttribute(n);break;case`rowSpan`:case`start`:r==null||typeof r==`function`||typeof r==`symbol`||isNaN(r)?e.removeAttribute(n):e.setAttribute(n,r);break;case`popover`:W(`beforetoggle`,e),W(`toggle`,e),It(e,`popover`,r);break;case`xlinkActuate`:Rt(e,`http://www.w3.org/1999/xlink`,`xlink:actuate`,r);break;case`xlinkArcrole`:Rt(e,`http://www.w3.org/1999/xlink`,`xlink:arcrole`,r);break;case`xlinkRole`:Rt(e,`http://www.w3.org/1999/xlink`,`xlink:role`,r);break;case`xlinkShow`:Rt(e,`http://www.w3.org/1999/xlink`,`xlink:show`,r);break;case`xlinkTitle`:Rt(e,`http://www.w3.org/1999/xlink`,`xlink:title`,r);break;case`xlinkType`:Rt(e,`http://www.w3.org/1999/xlink`,`xlink:type`,r);break;case`xmlBase`:Rt(e,`http://www.w3.org/XML/1998/namespace`,`xml:base`,r);break;case`xmlLang`:Rt(e,`http://www.w3.org/XML/1998/namespace`,`xml:lang`,r);break;case`xmlSpace`:Rt(e,`http://www.w3.org/XML/1998/namespace`,`xml:space`,r);break;case`is`:It(e,`is`,r);break;case`innerText`:case`textContent`:break;default:(!(2<n.length)||n[0]!==`o`&&n[0]!==`O`||n[1]!==`n`&&n[1]!==`N`)&&(n=an.get(n)||n,It(e,n,r))}}function Hd(e,t,n,r,a,o){switch(n){case`style`:nn(e,r,o);break;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(i(61));if(n=r.__html,n!=null){if(a.children!=null)throw Error(i(60));e.innerHTML=n}}break;case`children`:typeof r==`string`?$t(e,r):(typeof r==`number`||typeof r==`bigint`)&&$t(e,``+r);break;case`onScroll`:r!=null&&W(`scroll`,e);break;case`onScrollEnd`:r!=null&&W(`scrollend`,e);break;case`onClick`:r!=null&&(e.onclick=cn);break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`innerHTML`:case`ref`:break;case`innerText`:case`textContent`:break;default:if(!kt.hasOwnProperty(n))a:{if(n[0]===`o`&&n[1]===`n`&&(a=n.endsWith(`Capture`),t=n.slice(2,a?n.length-7:void 0),o=e[ht]||null,o=o==null?null:o[n],typeof o==`function`&&e.removeEventListener(t,o,a),typeof r==`function`)){typeof o!=`function`&&o!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(t,r,a);break a}n in e?e[n]=r:!0===r?e.setAttribute(n,``):It(e,n,r)}}}function Ud(e,t,n){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`img`:W(`error`,e),W(`load`,e);var r=!1,a=!1,o;for(o in n)if(n.hasOwnProperty(o)){var s=n[o];if(s!=null)switch(o){case`src`:r=!0;break;case`srcSet`:a=!0;break;case`children`:case`dangerouslySetInnerHTML`:throw Error(i(137,t));default:Vd(e,t,o,s,n,null)}}a&&Vd(e,t,`srcSet`,n.srcSet,n,null),r&&Vd(e,t,`src`,n.src,n,null);return;case`input`:W(`invalid`,e);var c=o=s=a=null,l=null,u=null;for(r in n)if(n.hasOwnProperty(r)){var d=n[r];if(d!=null)switch(r){case`name`:a=d;break;case`type`:s=d;break;case`checked`:l=d;break;case`defaultChecked`:u=d;break;case`value`:o=d;break;case`defaultValue`:c=d;break;case`children`:case`dangerouslySetInnerHTML`:if(d!=null)throw Error(i(137,t));break;default:Vd(e,t,r,d,n,null)}}Jt(e,o,c,l,u,s,a,!1);return;case`select`:for(a in W(`invalid`,e),r=s=o=null,n)if(n.hasOwnProperty(a)&&(c=n[a],c!=null))switch(a){case`value`:o=c;break;case`defaultValue`:s=c;break;case`multiple`:r=c;default:Vd(e,t,a,c,n,null)}t=o,n=s,e.multiple=!!r,t==null?n!=null&&Xt(e,!!r,n,!0):Xt(e,!!r,t,!1);return;case`textarea`:for(s in W(`invalid`,e),o=a=r=null,n)if(n.hasOwnProperty(s)&&(c=n[s],c!=null))switch(s){case`value`:r=c;break;case`defaultValue`:a=c;break;case`children`:o=c;break;case`dangerouslySetInnerHTML`:if(c!=null)throw Error(i(91));break;default:Vd(e,t,s,c,n,null)}Qt(e,r,a,o);return;case`option`:for(l in n)if(n.hasOwnProperty(l)&&(r=n[l],r!=null))switch(l){case`selected`:e.selected=r&&typeof r!=`function`&&typeof r!=`symbol`;break;default:Vd(e,t,l,r,n,null)}return;case`dialog`:W(`beforetoggle`,e),W(`toggle`,e),W(`cancel`,e),W(`close`,e);break;case`iframe`:case`object`:W(`load`,e);break;case`video`:case`audio`:for(r=0;r<Td.length;r++)W(Td[r],e);break;case`image`:W(`error`,e),W(`load`,e);break;case`details`:W(`toggle`,e);break;case`embed`:case`source`:case`link`:W(`error`,e),W(`load`,e);case`area`:case`base`:case`br`:case`col`:case`hr`:case`keygen`:case`meta`:case`param`:case`track`:case`wbr`:case`menuitem`:for(u in n)if(n.hasOwnProperty(u)&&(r=n[u],r!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:throw Error(i(137,t));default:Vd(e,t,u,r,n,null)}return;default:if(rn(t)){for(d in n)n.hasOwnProperty(d)&&(r=n[d],r!==void 0&&Hd(e,t,d,r,n,void 0));return}}for(c in n)n.hasOwnProperty(c)&&(r=n[c],r!=null&&Vd(e,t,c,r,n,null))}function Wd(e,t,n,r){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`input`:var a=null,o=null,s=null,c=null,l=null,u=null,d=null;for(m in n){var f=n[m];if(n.hasOwnProperty(m)&&f!=null)switch(m){case`checked`:break;case`value`:break;case`defaultValue`:l=f;default:r.hasOwnProperty(m)||Vd(e,t,m,null,r,f)}}for(var p in r){var m=r[p];if(f=n[p],r.hasOwnProperty(p)&&(m!=null||f!=null))switch(p){case`type`:o=m;break;case`name`:a=m;break;case`checked`:u=m;break;case`defaultChecked`:d=m;break;case`value`:s=m;break;case`defaultValue`:c=m;break;case`children`:case`dangerouslySetInnerHTML`:if(m!=null)throw Error(i(137,t));break;default:m!==f&&Vd(e,t,p,m,r,f)}}qt(e,s,c,l,u,d,o,a);return;case`select`:for(o in m=s=c=p=null,n)if(l=n[o],n.hasOwnProperty(o)&&l!=null)switch(o){case`value`:break;case`multiple`:m=l;default:r.hasOwnProperty(o)||Vd(e,t,o,null,r,l)}for(a in r)if(o=r[a],l=n[a],r.hasOwnProperty(a)&&(o!=null||l!=null))switch(a){case`value`:p=o;break;case`defaultValue`:c=o;break;case`multiple`:s=o;default:o!==l&&Vd(e,t,a,o,r,l)}t=c,n=s,r=m,p==null?!!r!=!!n&&(t==null?Xt(e,!!n,n?[]:``,!1):Xt(e,!!n,t,!0)):Xt(e,!!n,p,!1);return;case`textarea`:for(c in m=p=null,n)if(a=n[c],n.hasOwnProperty(c)&&a!=null&&!r.hasOwnProperty(c))switch(c){case`value`:break;case`children`:break;default:Vd(e,t,c,null,r,a)}for(s in r)if(a=r[s],o=n[s],r.hasOwnProperty(s)&&(a!=null||o!=null))switch(s){case`value`:p=a;break;case`defaultValue`:m=a;break;case`children`:break;case`dangerouslySetInnerHTML`:if(a!=null)throw Error(i(91));break;default:a!==o&&Vd(e,t,s,a,r,o)}Zt(e,p,m);return;case`option`:for(var h in n)if(p=n[h],n.hasOwnProperty(h)&&p!=null&&!r.hasOwnProperty(h))switch(h){case`selected`:e.selected=!1;break;default:Vd(e,t,h,null,r,p)}for(l in r)if(p=r[l],m=n[l],r.hasOwnProperty(l)&&p!==m&&(p!=null||m!=null))switch(l){case`selected`:e.selected=p&&typeof p!=`function`&&typeof p!=`symbol`;break;default:Vd(e,t,l,p,r,m)}return;case`img`:case`link`:case`area`:case`base`:case`br`:case`col`:case`embed`:case`hr`:case`keygen`:case`meta`:case`param`:case`source`:case`track`:case`wbr`:case`menuitem`:for(var g in n)p=n[g],n.hasOwnProperty(g)&&p!=null&&!r.hasOwnProperty(g)&&Vd(e,t,g,null,r,p);for(u in r)if(p=r[u],m=n[u],r.hasOwnProperty(u)&&p!==m&&(p!=null||m!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:if(p!=null)throw Error(i(137,t));break;default:Vd(e,t,u,p,r,m)}return;default:if(rn(t)){for(var _ in n)p=n[_],n.hasOwnProperty(_)&&p!==void 0&&!r.hasOwnProperty(_)&&Hd(e,t,_,void 0,r,p);for(d in r)p=r[d],m=n[d],!r.hasOwnProperty(d)||p===m||p===void 0&&m===void 0||Hd(e,t,d,p,r,m);return}}for(var v in n)p=n[v],n.hasOwnProperty(v)&&p!=null&&!r.hasOwnProperty(v)&&Vd(e,t,v,null,r,p);for(f in r)p=r[f],m=n[f],!r.hasOwnProperty(f)||p===m||p==null&&m==null||Vd(e,t,f,p,r,m)}function Gd(e){switch(e){case`css`:case`script`:case`font`:case`img`:case`image`:case`input`:case`link`:return!0;default:return!1}}function Kd(){if(typeof performance.getEntriesByType==`function`){for(var e=0,t=0,n=performance.getEntriesByType(`resource`),r=0;r<n.length;r++){var i=n[r],a=i.transferSize,o=i.initiatorType,s=i.duration;if(a&&s&&Gd(o)){for(o=0,s=i.responseEnd,r+=1;r<n.length;r++){var c=n[r],l=c.startTime;if(l>s)break;var u=c.transferSize,d=c.initiatorType;u&&Gd(d)&&(c=c.responseEnd,o+=u*(c<s?1:(s-l)/(c-l)))}if(--r,t+=8*(a+o)/(i.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e==`number`)?e:5}var qd=null,Jd=null;function Yd(e){return e.nodeType===9?e:e.ownerDocument}function Xd(e){switch(e){case`http://www.w3.org/2000/svg`:return 1;case`http://www.w3.org/1998/Math/MathML`:return 2;default:return 0}}function Zd(e,t){if(e===0)switch(t){case`svg`:return 1;case`math`:return 2;default:return 0}return e===1&&t===`foreignObject`?0:e}function Qd(e,t){return e===`textarea`||e===`noscript`||typeof t.children==`string`||typeof t.children==`number`||typeof t.children==`bigint`||typeof t.dangerouslySetInnerHTML==`object`&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var $d=null;function ef(){var e=window.event;return e&&e.type===`popstate`?e!==$d&&($d=e,!0):($d=null,!1)}var tf=typeof setTimeout==`function`?setTimeout:void 0,nf=typeof clearTimeout==`function`?clearTimeout:void 0,rf=typeof Promise==`function`?Promise:void 0,af=typeof queueMicrotask==`function`?queueMicrotask:rf===void 0?tf:function(e){return rf.resolve(null).then(e).catch(of)};function of(e){setTimeout(function(){throw e})}function sf(e){return e===`head`}function cf(e,t){var n=t,r=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8){if(n=i.data,n===`/$`||n===`/&`){if(r===0){e.removeChild(i),Hp(t);return}r--}else if(n===`$`||n===`$?`||n===`$~`||n===`$!`||n===`&`)r++;else if(n===`html`)Sf(e.ownerDocument.documentElement);else if(n===`head`){n=e.ownerDocument.head,Sf(n);for(var a=n.firstChild;a;){var o=a.nextSibling,s=a.nodeName;a[xt]||s===`SCRIPT`||s===`STYLE`||s===`LINK`&&a.rel.toLowerCase()===`stylesheet`||n.removeChild(a),a=o}}else n===`body`&&Sf(e.ownerDocument.body)}n=i}while(n);Hp(t)}function lf(e,t){var n=e;e=0;do{var r=n.nextSibling;if(n.nodeType===1?t?(n._stashedDisplay=n.style.display,n.style.display=`none`):(n.style.display=n._stashedDisplay||``,n.getAttribute(`style`)===``&&n.removeAttribute(`style`)):n.nodeType===3&&(t?(n._stashedText=n.nodeValue,n.nodeValue=``):n.nodeValue=n._stashedText||``),r&&r.nodeType===8){if(n=r.data,n===`/$`){if(e===0)break;e--}else n!==`$`&&n!==`$?`&&n!==`$~`&&n!==`$!`||e++}n=r}while(n)}function uf(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case`HTML`:case`HEAD`:case`BODY`:uf(n),St(n);continue;case`SCRIPT`:case`STYLE`:continue;case`LINK`:if(n.rel.toLowerCase()===`stylesheet`)continue}e.removeChild(n)}}function df(e,t,n,r){for(;e.nodeType===1;){var i=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!r&&(e.nodeName!==`INPUT`||e.type!==`hidden`))break}else if(!r){if(t===`input`&&e.type===`hidden`){var a=i.name==null?null:``+i.name;if(i.type===`hidden`&&e.getAttribute(`name`)===a)return e}else return e}else if(!e[xt])switch(t){case`meta`:if(!e.hasAttribute(`itemprop`))break;return e;case`link`:if(a=e.getAttribute(`rel`),a===`stylesheet`&&e.hasAttribute(`data-precedence`)||a!==i.rel||e.getAttribute(`href`)!==(i.href==null||i.href===``?null:i.href)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin)||e.getAttribute(`title`)!==(i.title==null?null:i.title))break;return e;case`style`:if(e.hasAttribute(`data-precedence`))break;return e;case`script`:if(a=e.getAttribute(`src`),(a!==(i.src==null?null:i.src)||e.getAttribute(`type`)!==(i.type==null?null:i.type)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin))&&a&&e.hasAttribute(`async`)&&!e.hasAttribute(`itemprop`))break;return e;default:return e}if(e=_f(e.nextSibling),e===null)break}return null}function ff(e,t,n){if(t===``)return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!n||(e=_f(e.nextSibling),e===null))return null;return e}function pf(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!t||(e=_f(e.nextSibling),e===null))return null;return e}function mf(e){return e.data===`$?`||e.data===`$~`}function hf(e){return e.data===`$!`||e.data===`$?`&&e.ownerDocument.readyState!==`loading`}function gf(e,t){var n=e.ownerDocument;if(e.data===`$~`)e._reactRetry=t;else if(e.data!==`$?`||n.readyState!==`loading`)t();else{var r=function(){t(),n.removeEventListener(`DOMContentLoaded`,r)};n.addEventListener(`DOMContentLoaded`,r),e._reactRetry=r}}function _f(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t===`$`||t===`$!`||t===`$?`||t===`$~`||t===`&`||t===`F!`||t===`F`)break;if(t===`/$`||t===`/&`)return null}}return e}var vf=null;function yf(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`/$`||n===`/&`){if(t===0)return _f(e.nextSibling);t--}else n!==`$`&&n!==`$!`&&n!==`$?`&&n!==`$~`&&n!==`&`||t++}e=e.nextSibling}return null}function bf(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`$`||n===`$!`||n===`$?`||n===`$~`||n===`&`){if(t===0)return e;t--}else n!==`/$`&&n!==`/&`||t++}e=e.previousSibling}return null}function xf(e,t,n){switch(t=Yd(n),e){case`html`:if(e=t.documentElement,!e)throw Error(i(452));return e;case`head`:if(e=t.head,!e)throw Error(i(453));return e;case`body`:if(e=t.body,!e)throw Error(i(454));return e;default:throw Error(i(451))}}function Sf(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);St(e)}var Cf=new Map,wf=new Set;function Tf(e){return typeof e.getRootNode==`function`?e.getRootNode():e.nodeType===9?e:e.ownerDocument}var Ef=A.d;A.d={f:Df,r:Of,D:jf,C:Mf,L:Nf,m:Pf,X:If,S:Ff,M:Lf};function Df(){var e=Ef.f(),t=Du();return e||t}function Of(e){var t=wt(e);t!==null&&t.tag===5&&t.type===`form`?Ns(t):Ef.r(e)}var kf=typeof document>`u`?null:document;function Af(e,t,n){var r=kf;if(r&&typeof t==`string`&&t){var i=Kt(t);i=`link[rel="`+e+`"][href="`+i+`"]`,typeof n==`string`&&(i+=`[crossorigin="`+n+`"]`),wf.has(i)||(wf.add(i),e={rel:e,crossOrigin:n,href:t},r.querySelector(i)===null&&(t=r.createElement(`link`),Ud(t,`link`,e),Dt(t),r.head.appendChild(t)))}}function jf(e){Ef.D(e),Af(`dns-prefetch`,e,null)}function Mf(e,t){Ef.C(e,t),Af(`preconnect`,e,t)}function Nf(e,t,n){Ef.L(e,t,n);var r=kf;if(r&&e&&t){var i=`link[rel="preload"][as="`+Kt(t)+`"]`;t===`image`&&n&&n.imageSrcSet?(i+=`[imagesrcset="`+Kt(n.imageSrcSet)+`"]`,typeof n.imageSizes==`string`&&(i+=`[imagesizes="`+Kt(n.imageSizes)+`"]`)):i+=`[href="`+Kt(e)+`"]`;var a=i;switch(t){case`style`:a=zf(e);break;case`script`:a=Uf(e)}Cf.has(a)||(e=m({rel:`preload`,href:t===`image`&&n&&n.imageSrcSet?void 0:e,as:t},n),Cf.set(a,e),r.querySelector(i)!==null||t===`style`&&r.querySelector(Bf(a))||t===`script`&&r.querySelector(Wf(a))||(t=r.createElement(`link`),Ud(t,`link`,e),Dt(t),r.head.appendChild(t)))}}function Pf(e,t){Ef.m(e,t);var n=kf;if(n&&e){var r=t&&typeof t.as==`string`?t.as:`script`,i=`link[rel="modulepreload"][as="`+Kt(r)+`"][href="`+Kt(e)+`"]`,a=i;switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:a=Uf(e)}if(!Cf.has(a)&&(e=m({rel:`modulepreload`,href:e},t),Cf.set(a,e),n.querySelector(i)===null)){switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:if(n.querySelector(Wf(a)))return}r=n.createElement(`link`),Ud(r,`link`,e),Dt(r),n.head.appendChild(r)}}}function Ff(e,t,n){Ef.S(e,t,n);var r=kf;if(r&&e){var i=Et(r).hoistableStyles,a=zf(e);t||=`default`;var o=i.get(a);if(!o){var s={loading:0,preload:null};if(o=r.querySelector(Bf(a)))s.loading=5;else{e=m({rel:`stylesheet`,href:e,"data-precedence":t},n),(n=Cf.get(a))&&qf(e,n);var c=o=r.createElement(`link`);Dt(c),Ud(c,`link`,e),c._p=new Promise(function(e,t){c.onload=e,c.onerror=t}),c.addEventListener(`load`,function(){s.loading|=1}),c.addEventListener(`error`,function(){s.loading|=2}),s.loading|=4,Kf(o,t,r)}o={type:`stylesheet`,instance:o,count:1,state:s},i.set(a,o)}}}function If(e,t){Ef.X(e,t);var n=kf;if(n&&e){var r=Et(n).hoistableScripts,i=Uf(e),a=r.get(i);a||(a=n.querySelector(Wf(i)),a||(e=m({src:e,async:!0},t),(t=Cf.get(i))&&Jf(e,t),a=n.createElement(`script`),Dt(a),Ud(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function Lf(e,t){Ef.M(e,t);var n=kf;if(n&&e){var r=Et(n).hoistableScripts,i=Uf(e),a=r.get(i);a||(a=n.querySelector(Wf(i)),a||(e=m({src:e,async:!0,type:`module`},t),(t=Cf.get(i))&&Jf(e,t),a=n.createElement(`script`),Dt(a),Ud(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function Rf(e,t,n,r){var a=(a=he.current)?Tf(a):null;if(!a)throw Error(i(446));switch(e){case`meta`:case`title`:return null;case`style`:return typeof n.precedence==`string`&&typeof n.href==`string`?(t=zf(n.href),n=Et(a).hoistableStyles,r=n.get(t),r||(r={type:`style`,instance:null,count:0,state:null},n.set(t,r)),r):{type:`void`,instance:null,count:0,state:null};case`link`:if(n.rel===`stylesheet`&&typeof n.href==`string`&&typeof n.precedence==`string`){e=zf(n.href);var o=Et(a).hoistableStyles,s=o.get(e);if(s||(a=a.ownerDocument||a,s={type:`stylesheet`,instance:null,count:0,state:{loading:0,preload:null}},o.set(e,s),(o=a.querySelector(Bf(e)))&&!o._p&&(s.instance=o,s.state.loading=5),Cf.has(e)||(n={rel:`preload`,as:`style`,href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},Cf.set(e,n),o||Hf(a,e,n,s.state))),t&&r===null)throw Error(i(528,``));return s}if(t&&r!==null)throw Error(i(529,``));return null;case`script`:return t=n.async,n=n.src,typeof n==`string`&&t&&typeof t!=`function`&&typeof t!=`symbol`?(t=Uf(n),n=Et(a).hoistableScripts,r=n.get(t),r||(r={type:`script`,instance:null,count:0,state:null},n.set(t,r)),r):{type:`void`,instance:null,count:0,state:null};default:throw Error(i(444,e))}}function zf(e){return`href="`+Kt(e)+`"`}function Bf(e){return`link[rel="stylesheet"][`+e+`]`}function Vf(e){return m({},e,{"data-precedence":e.precedence,precedence:null})}function Hf(e,t,n,r){e.querySelector(`link[rel="preload"][as="style"][`+t+`]`)?r.loading=1:(t=e.createElement(`link`),r.preload=t,t.addEventListener(`load`,function(){return r.loading|=1}),t.addEventListener(`error`,function(){return r.loading|=2}),Ud(t,`link`,n),Dt(t),e.head.appendChild(t))}function Uf(e){return`[src="`+Kt(e)+`"]`}function Wf(e){return`script[async]`+e}function Gf(e,t,n){if(t.count++,t.instance===null)switch(t.type){case`style`:var r=e.querySelector(`style[data-href~="`+Kt(n.href)+`"]`);if(r)return t.instance=r,Dt(r),r;var a=m({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return r=(e.ownerDocument||e).createElement(`style`),Dt(r),Ud(r,`style`,a),Kf(r,n.precedence,e),t.instance=r;case`stylesheet`:a=zf(n.href);var o=e.querySelector(Bf(a));if(o)return t.state.loading|=4,t.instance=o,Dt(o),o;r=Vf(n),(a=Cf.get(a))&&qf(r,a),o=(e.ownerDocument||e).createElement(`link`),Dt(o);var s=o;return s._p=new Promise(function(e,t){s.onload=e,s.onerror=t}),Ud(o,`link`,r),t.state.loading|=4,Kf(o,n.precedence,e),t.instance=o;case`script`:return o=Uf(n.src),(a=e.querySelector(Wf(o)))?(t.instance=a,Dt(a),a):(r=n,(a=Cf.get(o))&&(r=m({},n),Jf(r,a)),e=e.ownerDocument||e,a=e.createElement(`script`),Dt(a),Ud(a,`link`,r),e.head.appendChild(a),t.instance=a);case`void`:return null;default:throw Error(i(443,t.type))}else t.type===`stylesheet`&&!(t.state.loading&4)&&(r=t.instance,t.state.loading|=4,Kf(r,n.precedence,e));return t.instance}function Kf(e,t,n){for(var r=n.querySelectorAll(`link[rel="stylesheet"][data-precedence],style[data-precedence]`),i=r.length?r[r.length-1]:null,a=i,o=0;o<r.length;o++){var s=r[o];if(s.dataset.precedence===t)a=s;else if(a!==i)break}a?a.parentNode.insertBefore(e,a.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function qf(e,t){e.crossOrigin??=t.crossOrigin,e.referrerPolicy??=t.referrerPolicy,e.title??=t.title}function Jf(e,t){e.crossOrigin??=t.crossOrigin,e.referrerPolicy??=t.referrerPolicy,e.integrity??=t.integrity}var Yf=null;function Xf(e,t,n){if(Yf===null){var r=new Map,i=Yf=new Map;i.set(n,r)}else i=Yf,r=i.get(n),r||(r=new Map,i.set(n,r));if(r.has(e))return r;for(r.set(e,null),n=n.getElementsByTagName(e),i=0;i<n.length;i++){var a=n[i];if(!(a[xt]||a[mt]||e===`link`&&a.getAttribute(`rel`)===`stylesheet`)&&a.namespaceURI!==`http://www.w3.org/2000/svg`){var o=a.getAttribute(t)||``;o=e+o;var s=r.get(o);s?s.push(a):r.set(o,[a])}}return r}function Zf(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t===`title`?e.querySelector(`head > title`):null)}function Qf(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case`meta`:case`title`:return!0;case`style`:if(typeof t.precedence!=`string`||typeof t.href!=`string`||t.href===``)break;return!0;case`link`:if(typeof t.rel!=`string`||typeof t.href!=`string`||t.href===``||t.onLoad||t.onError)break;switch(t.rel){case`stylesheet`:return e=t.disabled,typeof t.precedence==`string`&&e==null;default:return!0}case`script`:if(t.async&&typeof t.async!=`function`&&typeof t.async!=`symbol`&&!t.onLoad&&!t.onError&&t.src&&typeof t.src==`string`)return!0}return!1}function $f(e){return!(e.type===`stylesheet`&&!(e.state.loading&3))}function ep(e,t,n,r){if(n.type===`stylesheet`&&(typeof r.media!=`string`||!1!==matchMedia(r.media).matches)&&!(n.state.loading&4)){if(n.instance===null){var i=zf(r.href),a=t.querySelector(Bf(i));if(a){t=a._p,typeof t==`object`&&t&&typeof t.then==`function`&&(e.count++,e=rp.bind(e),t.then(e,e)),n.state.loading|=4,n.instance=a,Dt(a);return}a=t.ownerDocument||t,r=Vf(r),(i=Cf.get(i))&&qf(r,i),a=a.createElement(`link`),Dt(a);var o=a;o._p=new Promise(function(e,t){o.onload=e,o.onerror=t}),Ud(a,`link`,r),n.instance=a}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(n,t),(t=n.state.preload)&&!(n.state.loading&3)&&(e.count++,n=rp.bind(e),t.addEventListener(`load`,n),t.addEventListener(`error`,n))}}var tp=0;function np(e,t){return e.stylesheets&&e.count===0&&ap(e,e.stylesheets),0<e.count||0<e.imgCount?function(n){var r=setTimeout(function(){if(e.stylesheets&&ap(e,e.stylesheets),e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}},6e4+t);0<e.imgBytes&&tp===0&&(tp=62500*Kd());var i=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&ap(e,e.stylesheets),e.unsuspend)){var t=e.unsuspend;e.unsuspend=null,t()}},(e.imgBytes>tp?50:800)+t);return e.unsuspend=n,function(){e.unsuspend=null,clearTimeout(r),clearTimeout(i)}}:null}function rp(){if(this.count--,this.count===0&&(this.imgCount===0||!this.waitingForImages)){if(this.stylesheets)ap(this,this.stylesheets);else if(this.unsuspend){var e=this.unsuspend;this.unsuspend=null,e()}}}var ip=null;function ap(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,ip=new Map,t.forEach(op,e),ip=null,rp.call(e))}function op(e,t){if(!(t.state.loading&4)){var n=ip.get(e);if(n)var r=n.get(null);else{n=new Map,ip.set(e,n);for(var i=e.querySelectorAll(`link[data-precedence],style[data-precedence]`),a=0;a<i.length;a++){var o=i[a];(o.nodeName===`LINK`||o.getAttribute(`media`)!==`not all`)&&(n.set(o.dataset.precedence,o),r=o)}r&&n.set(null,r)}i=t.instance,o=i.getAttribute(`data-precedence`),a=n.get(o)||r,a===r&&n.set(null,i),n.set(o,i),this.count++,r=rp.bind(this),i.addEventListener(`load`,r),i.addEventListener(`error`,r),a?a.parentNode.insertBefore(i,a.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(i,e.firstChild)),t.state.loading|=4}}var sp={$$typeof:C,Provider:null,Consumer:null,_currentValue:se,_currentValue2:se,_threadCount:0};function cp(e,t,n,r,i,a,o,s,c){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=rt(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=rt(0),this.hiddenUpdates=rt(null),this.identifierPrefix=r,this.onUncaughtError=i,this.onCaughtError=a,this.onRecoverableError=o,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=c,this.incompleteTransitions=new Map}function lp(e,t,n,r,i,a,o,s,c,l,u,d){return e=new cp(e,t,n,o,c,l,u,d,s),t=1,!0===a&&(t|=24),a=hi(3,null,null,t),e.current=a,a.stateNode=e,t=ha(),t.refCount++,e.pooledCache=t,t.refCount++,a.memoizedState={element:r,isDehydrated:n,cache:t},Ja(a),e}function up(e){return e?(e=pi,e):pi}function dp(e,t,n,r,i,a){i=up(i),r.context===null?r.context=i:r.pendingContext=i,r=Xa(t),r.payload={element:n},a=a===void 0?null:a,a!==null&&(r.callback=a),n=Za(e,r,t),n!==null&&(Su(n,e,t),Qa(n,e,t))}function fp(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function pp(e,t){fp(e,t),(e=e.alternate)&&fp(e,t)}function mp(e){if(e.tag===13||e.tag===31){var t=ui(e,67108864);t!==null&&Su(t,e,67108864),pp(e,67108864)}}function hp(e){if(e.tag===13||e.tag===31){var t=bu();t=lt(t);var n=ui(e,t);n!==null&&Su(n,e,t),pp(e,t)}}var gp=!0;function _p(e,t,n,r){var i=k.T;k.T=null;var a=A.p;try{A.p=2,yp(e,t,n,r)}finally{A.p=a,k.T=i}}function vp(e,t,n,r){var i=k.T;k.T=null;var a=A.p;try{A.p=8,yp(e,t,n,r)}finally{A.p=a,k.T=i}}function yp(e,t,n,r){if(gp){var i=bp(r);if(i===null)Md(e,t,r,xp,n),Mp(e,r);else if(Pp(i,e,t,n,r))r.stopPropagation();else if(Mp(e,r),t&4&&-1<jp.indexOf(e)){for(;i!==null;){var a=wt(i);if(a!==null)switch(a.tag){case 3:if(a=a.stateNode,a.current.memoizedState.isDehydrated){var o=Qe(a.pendingLanes);if(o!==0){var s=a;for(s.pendingLanes|=2,s.entangledLanes|=2;o;){var c=1<<31-Ge(o);s.entanglements[1]|=c,o&=~c}dd(a),!(V&6)&&(cu=Ne()+500,fd(0,!1))}}break;case 31:case 13:s=ui(a,2),s!==null&&Su(s,a,2),Du(),pp(a,2)}if(a=bp(r),a===null&&Md(e,t,r,xp,n),a===i)break;i=a}i!==null&&r.stopPropagation()}else Md(e,t,r,null,n)}}function bp(e){return e=un(e),Sp(e)}var xp=null;function Sp(e){if(xp=null,e=Ct(e),e!==null){var t=o(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=s(t),e!==null)return e;e=null}else if(n===31){if(e=c(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return xp=e,null}function Cp(e){switch(e){case`beforetoggle`:case`cancel`:case`click`:case`close`:case`contextmenu`:case`copy`:case`cut`:case`auxclick`:case`dblclick`:case`dragend`:case`dragstart`:case`drop`:case`focusin`:case`focusout`:case`input`:case`invalid`:case`keydown`:case`keypress`:case`keyup`:case`mousedown`:case`mouseup`:case`paste`:case`pause`:case`play`:case`pointercancel`:case`pointerdown`:case`pointerup`:case`ratechange`:case`reset`:case`resize`:case`seeked`:case`submit`:case`toggle`:case`touchcancel`:case`touchend`:case`touchstart`:case`volumechange`:case`change`:case`selectionchange`:case`textInput`:case`compositionstart`:case`compositionend`:case`compositionupdate`:case`beforeblur`:case`afterblur`:case`beforeinput`:case`blur`:case`fullscreenchange`:case`focus`:case`hashchange`:case`popstate`:case`select`:case`selectstart`:return 2;case`drag`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`mousemove`:case`mouseout`:case`mouseover`:case`pointermove`:case`pointerout`:case`pointerover`:case`scroll`:case`touchmove`:case`wheel`:case`mouseenter`:case`mouseleave`:case`pointerenter`:case`pointerleave`:return 8;case`message`:switch(Pe()){case Fe:return 2;case Ie:return 8;case Le:case Re:return 32;case ze:return 268435456;default:return 32}default:return 32}}var wp=!1,Tp=null,Ep=null,Dp=null,Op=new Map,kp=new Map,Ap=[],jp=`mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset`.split(` `);function Mp(e,t){switch(e){case`focusin`:case`focusout`:Tp=null;break;case`dragenter`:case`dragleave`:Ep=null;break;case`mouseover`:case`mouseout`:Dp=null;break;case`pointerover`:case`pointerout`:Op.delete(t.pointerId);break;case`gotpointercapture`:case`lostpointercapture`:kp.delete(t.pointerId)}}function Np(e,t,n,r,i,a){return e===null||e.nativeEvent!==a?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:a,targetContainers:[i]},t!==null&&(t=wt(t),t!==null&&mp(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,i!==null&&t.indexOf(i)===-1&&t.push(i),e)}function Pp(e,t,n,r,i){switch(t){case`focusin`:return Tp=Np(Tp,e,t,n,r,i),!0;case`dragenter`:return Ep=Np(Ep,e,t,n,r,i),!0;case`mouseover`:return Dp=Np(Dp,e,t,n,r,i),!0;case`pointerover`:var a=i.pointerId;return Op.set(a,Np(Op.get(a)||null,e,t,n,r,i)),!0;case`gotpointercapture`:return a=i.pointerId,kp.set(a,Np(kp.get(a)||null,e,t,n,r,i)),!0}return!1}function Fp(e){var t=Ct(e.target);if(t!==null){var n=o(t);if(n!==null){if(t=n.tag,t===13){if(t=s(n),t!==null){e.blockedOn=t,ft(e.priority,function(){hp(n)});return}}else if(t===31){if(t=c(n),t!==null){e.blockedOn=t,ft(e.priority,function(){hp(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Ip(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=bp(e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);ln=r,n.target.dispatchEvent(r),ln=null}else return t=wt(n),t!==null&&mp(t),e.blockedOn=n,!1;t.shift()}return!0}function Lp(e,t,n){Ip(e)&&n.delete(t)}function Rp(){wp=!1,Tp!==null&&Ip(Tp)&&(Tp=null),Ep!==null&&Ip(Ep)&&(Ep=null),Dp!==null&&Ip(Dp)&&(Dp=null),Op.forEach(Lp),kp.forEach(Lp)}function zp(e,n){e.blockedOn===n&&(e.blockedOn=null,wp||(wp=!0,t.unstable_scheduleCallback(t.unstable_NormalPriority,Rp)))}var Bp=null;function Vp(e){Bp!==e&&(Bp=e,t.unstable_scheduleCallback(t.unstable_NormalPriority,function(){Bp===e&&(Bp=null);for(var t=0;t<e.length;t+=3){var n=e[t],r=e[t+1],i=e[t+2];if(typeof r!=`function`){if(Sp(r||n)===null)continue;break}var a=wt(n);a!==null&&(e.splice(t,3),t-=3,js(a,{pending:!0,data:i,method:n.method,action:r},r,i))}}))}function Hp(e){function t(t){return zp(t,e)}Tp!==null&&zp(Tp,e),Ep!==null&&zp(Ep,e),Dp!==null&&zp(Dp,e),Op.forEach(t),kp.forEach(t);for(var n=0;n<Ap.length;n++){var r=Ap[n];r.blockedOn===e&&(r.blockedOn=null)}for(;0<Ap.length&&(n=Ap[0],n.blockedOn===null);)Fp(n),n.blockedOn===null&&Ap.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(r=0;r<n.length;r+=3){var i=n[r],a=n[r+1],o=i[ht]||null;if(typeof a==`function`)o||Vp(n);else if(o){var s=null;if(a&&a.hasAttribute(`formAction`)){if(i=a,o=a[ht]||null)s=o.formAction;else if(Sp(i)!==null)continue}else s=o.action;typeof s==`function`?n[r+1]=s:(n.splice(r,3),r-=3),Vp(n)}}}function Up(){function e(e){e.canIntercept&&e.info===`react-transition`&&e.intercept({handler:function(){return new Promise(function(e){return i=e})},focusReset:`manual`,scroll:`manual`})}function t(){i!==null&&(i(),i=null),r||setTimeout(n,20)}function n(){if(!r&&!navigation.transition){var e=navigation.currentEntry;e&&e.url!=null&&navigation.navigate(e.url,{state:e.getState(),info:`react-transition`,history:`replace`})}}if(typeof navigation==`object`){var r=!1,i=null;return navigation.addEventListener(`navigate`,e),navigation.addEventListener(`navigatesuccess`,t),navigation.addEventListener(`navigateerror`,t),setTimeout(n,100),function(){r=!0,navigation.removeEventListener(`navigate`,e),navigation.removeEventListener(`navigatesuccess`,t),navigation.removeEventListener(`navigateerror`,t),i!==null&&(i(),i=null)}}}function Wp(e){this._internalRoot=e}Gp.prototype.render=Wp.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(i(409));var n=t.current;dp(n,bu(),e,t,null,null)},Gp.prototype.unmount=Wp.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;dp(e.current,2,null,e,null,null),Du(),t[gt]=null}};function Gp(e){this._internalRoot=e}Gp.prototype.unstable_scheduleHydration=function(e){if(e){var t=dt();e={blockedOn:null,target:e,priority:t};for(var n=0;n<Ap.length&&t!==0&&t<Ap[n].priority;n++);Ap.splice(n,0,e),n===0&&Fp(e)}};var Kp=n.version;if(Kp!==`19.2.8`)throw Error(i(527,Kp,`19.2.8`));A.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render==`function`?Error(i(188)):(e=Object.keys(e).join(`,`),Error(i(268,e)));return e=u(t),e=e===null?null:f(e),e=e===null?null:e.stateNode,e};var qp={bundleType:0,version:`19.2.8`,rendererPackageName:`react-dom`,currentDispatcherRef:k,reconcilerVersion:`19.2.8`};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<`u`){var Jp=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!Jp.isDisabled&&Jp.supportsFiber)try{He=Jp.inject(qp),Ue=Jp}catch{}}e.createRoot=function(e,t){if(!a(e))throw Error(i(299));var n=!1,r=``,o=ec,s=tc,c=nc;return t!=null&&(!0===t.unstable_strictMode&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onUncaughtError!==void 0&&(o=t.onUncaughtError),t.onCaughtError!==void 0&&(s=t.onCaughtError),t.onRecoverableError!==void 0&&(c=t.onRecoverableError)),t=lp(e,1,!1,null,null,n,r,null,o,s,c,Up),e[gt]=t.current,Ad(e),new Wp(t)}})),_=o(((e,t)=>{function n(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>`u`||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!=`function`))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=g()})),v=`modulepreload`,y=function(e){return`/recombyn/`+e},b={},x=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}function s(e){return import.meta.resolve?import.meta.resolve(e):new URL(e,import.meta.url).href}r=o(t.map(t=>{if(t=y(t,n),t=s(t),t in b)return;b[t]=!0;let r=t.endsWith(`.css`);for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}let i=document.createElement(`link`);if(i.rel=r?`stylesheet`:v,r||(i.as=`script`),i.crossOrigin=``,i.href=t,a&&i.setAttribute(`nonce`,a),document.head.appendChild(i),r)return new Promise((e,n)=>{i.addEventListener(`load`,e),i.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},S=l(d(),1),C=/^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i,w=/^[\\/]{2}/;function T(e,t){return t+e.replace(/\\/g,`/`)}var E=`popstate`;function ee(e){return typeof e==`object`&&!!e&&`pathname`in e&&`search`in e&&`hash`in e&&`state`in e&&`key`in e}function D(e={}){function t(e,t){let n=t.state?.masked,{pathname:r,search:i,hash:a}=n||e.location;return ie(``,{pathname:r,search:i,hash:a},t.state&&t.state.usr||null,t.state&&t.state.key||`default`,n?{pathname:e.location.pathname,search:e.location.search,hash:e.location.hash}:void 0)}function n(e,t){return typeof t==`string`?t:ae(t)}return k(t,n,null,e)}function O(e,t){if(e===!1||e==null)throw Error(t)}function te(e,t){if(!e){typeof console<`u`&&console.warn(t);try{throw Error(t)}catch{}}}function ne(){return Math.random().toString(36).substring(2,10)}function re(e,t){return{usr:e.state,key:e.key,idx:t,masked:e.mask?{pathname:e.pathname,search:e.search,hash:e.hash}:void 0}}function ie(e,t,n=null,r,i){return{pathname:typeof e==`string`?e:e.pathname,search:``,hash:``,...typeof t==`string`?oe(t):t,state:n,key:t&&t.key||r||ne(),mask:i}}function ae({pathname:e=`/`,search:t=``,hash:n=``}){return t&&t!==`?`&&(e+=t.charAt(0)===`?`?t:`?`+t),n&&n!==`#`&&(e+=n.charAt(0)===`#`?n:`#`+n),e}function oe(e){let t={};if(e){let n=e.indexOf(`#`);n>=0&&(t.hash=e.substring(n),e=e.substring(0,n));let r=e.indexOf(`?`);r>=0&&(t.search=e.substring(r),e=e.substring(0,r)),e&&(t.pathname=e)}return t}function k(e,t,n,r={}){let{window:i=document.defaultView,v5Compat:a=!1}=r,o=i.history,s=`POP`,c=null,l=u();l??(l=0,o.replaceState({...o.state,idx:l},``));function u(){return(o.state||{idx:null}).idx}function d(){s=`POP`;let e=u(),t=e==null?null:e-l;l=e,c&&c({action:s,location:h.location,delta:t})}function f(e,t){s=`PUSH`;let r=ee(e)?e:ie(h.location,e,t);n&&n(r,e),l=u()+1;let d=re(r,l),f=h.createHref(r.mask||r);try{o.pushState(d,``,f)}catch(e){if(e instanceof DOMException&&e.name===`DataCloneError`)throw e;i.location.assign(f)}a&&c&&c({action:s,location:h.location,delta:1})}function p(e,t){s=`REPLACE`;let r=ee(e)?e:ie(h.location,e,t);n&&n(r,e),l=u();let i=re(r,l),d=h.createHref(r.mask||r);o.replaceState(i,``,d),a&&c&&c({action:s,location:h.location,delta:0})}function m(e){return A(i,e)}let h={get action(){return s},get location(){return e(i,o)},listen(e){if(c)throw Error(`A history only accepts one active listener`);return i.addEventListener(E,d),c=e,()=>{i.removeEventListener(E,d),c=null}},createHref(e){return t(i,e)},createURL:m,encodeLocation(e){let t=m(e);return{pathname:t.pathname,search:t.search,hash:t.hash}},push:f,replace:p,go(e){return o.go(e)}};return h}function A(e,t,n=!1){let r=`http://localhost`;e&&(r=e.location.origin===`null`?e.location.href:e.location.origin),O(r,`No window.location.(origin|href) available to create URL`);let i=typeof t==`string`?t:ae(t);return i=i.replace(/ $/,`%20`),!n&&w.test(i)&&(i=r+i),new URL(i,r)}function se(e,t,n=`/`){return ce(e,t,n,!1)}function ce(e,t,n,r,i){let a=De((typeof t==`string`?oe(t):t).pathname||`/`,n);if(a==null)return null;let o=i??le(e),s=null,c=Ee(a);for(let e=0;s==null&&e<o.length;++e)s=Se(o[e],c,r);return s}function le(e){let t=ue(e);return fe(t),t}function ue(e,t=[],n=[],r=``,i=!1){let a=(e,a,o=i,s)=>{let c={relativePath:s===void 0?e.path||``:s,caseSensitive:e.caseSensitive===!0,childrenIndex:a,route:e};if(c.relativePath.startsWith(`/`)){if(!c.relativePath.startsWith(r)&&o)return;O(c.relativePath.startsWith(r),`Absolute route path "${c.relativePath}" nested under path "${r}" is not valid. An absolute child route path must start with the combined path of all its parent routes.`),c.relativePath=c.relativePath.slice(r.length)}let l=Fe([r,c.relativePath]),u=n.concat(c);e.children&&e.children.length>0&&(O(e.index!==!0,`Index routes must not have child routes. Please remove all child routes from route path "${l}".`),ue(e.children,t,u,l,o)),!(e.path==null&&!e.index)&&t.push({path:l,score:be(l,e.index),routesMeta:u.map((e,t)=>{let[n,r]=Te(e.relativePath,e.caseSensitive,t===u.length-1);return{...e,matcher:n,compiledParams:r}})})};return e.forEach((e,t)=>{if(e.path===``||!e.path?.includes(`?`))a(e,t);else for(let n of de(e.path))a(e,t,!0,n)}),t}function de(e){let t=e.split(`/`);if(t.length===0)return[];let[n,...r]=t,i=n.endsWith(`?`),a=n.replace(/\?$/,``);if(r.length===0)return i?[a,``]:[a];let o=de(r.join(`/`)),s=[];return s.push(...o.map(e=>e===``?a:[a,e].join(`/`))),i&&s.push(...o),s.map(t=>e.startsWith(`/`)&&t===``?`/`:t)}function fe(e){e.sort((e,t)=>e.score===t.score?xe(e.routesMeta.map(e=>e.childrenIndex),t.routesMeta.map(e=>e.childrenIndex)):t.score-e.score)}var pe=/^:[\w-]+$/,me=3,he=2,ge=1,_e=10,ve=-2,ye=e=>e===`*`;function be(e,t){let n=e.split(`/`),r=n.length;return n.some(ye)&&(r+=ve),t&&(r+=he),n.filter(e=>!ye(e)).reduce((e,t)=>e+(pe.test(t)?me:t===``?ge:_e),r)}function xe(e,t){return e.length===t.length&&e.slice(0,-1).every((e,n)=>e===t[n])?e[e.length-1]-t[t.length-1]:0}function Se(e,t,n=!1){let{routesMeta:r}=e,i={},a=`/`,o=[];for(let e=0;e<r.length;++e){let s=r[e],c=e===r.length-1,l=a===`/`?t:t.slice(a.length)||`/`,u={path:s.relativePath,caseSensitive:s.caseSensitive,end:c},d=s.matcher&&s.compiledParams?we(u,l,s.matcher,s.compiledParams):Ce(u,l),f=s.route;if(!d&&c&&n&&!r[r.length-1].route.index&&(d=Ce({path:s.relativePath,caseSensitive:s.caseSensitive,end:!1},l)),!d)return null;Object.assign(i,d.params),o.push({params:i,pathname:Fe([a,d.pathname]),pathnameBase:Le(Fe([a,d.pathnameBase])),route:f}),d.pathnameBase!==`/`&&(a=Fe([a,d.pathnameBase]))}return o}function Ce(e,t){typeof e==`string`&&(e={path:e,caseSensitive:!1,end:!0});let[n,r]=Te(e.path,e.caseSensitive,e.end);return we(e,t,n,r)}function we(e,t,n,r){let i=t.match(n);if(!i)return null;let a=i[0],o=a.replace(/(.)\/+$/,`$1`),s=i.slice(1);return{params:r.reduce((e,{paramName:t,isOptional:n},r)=>{if(t===`*`){let e=s[r]||``;o=a.slice(0,a.length-e.length).replace(/(.)\/+$/,`$1`)}let i=s[r];return e[t]=n&&!i?void 0:(i||``).replace(/%2F/g,`/`),e},{}),pathname:a,pathnameBase:o,pattern:e}}function Te(e,t=!1,n=!0){te(e===`*`||!e.endsWith(`*`)||e.endsWith(`/*`),`Route path "${e}" will be treated as if it were "${e.replace(/\*$/,`/*`)}" because the \`*\` character must always follow a \`/\` in the pattern. To get rid of this warning, please change the route path to "${e.replace(/\*$/,`/*`)}".`);let r=[],i=`^`+e.replace(/\/*\*?$/,``).replace(/^\/*/,`/`).replace(/[\\.*+^${}|()[\]]/g,`\\$&`).replace(/\/:([\w-]+)(\?)?/g,(e,t,n,i,a)=>{if(r.push({paramName:t,isOptional:n!=null}),n){let t=a.charAt(i+e.length);return t&&t!==`/`?`/([^\\/]*)`:`(?:/([^\\/]*))?`}return`/([^\\/]+)`}).replace(/\/([\w-]+)\?(\/|$)/g,`(/$1)?$2`);return e.endsWith(`*`)?(r.push({paramName:`*`}),i+=e===`*`||e===`/*`?`(.*)$`:`(?:\\/(.+)|\\/*)$`):n?i+=`\\/*$`:e!==``&&e!==`/`&&(i+=`(?:(?=\\/|$))`),[new RegExp(i,t?void 0:`i`),r]}function Ee(e){try{return e.split(`/`).map(e=>decodeURIComponent(e).replace(/\//g,`%2F`)).join(`/`)}catch(t){return te(!1,`The URL path "${e}" could not be decoded because it is a malformed URL segment. This is probably due to a bad percent encoding (${t}).`),e}}function De(e,t){if(t===`/`)return e;if(!e.toLowerCase().startsWith(t.toLowerCase()))return null;let n=t.endsWith(`/`)?t.length-1:t.length,r=e.charAt(n);return r&&r!==`/`?null:e.slice(n)||`/`}function Oe(e,t=`/`){let{pathname:n,search:r=``,hash:i=``}=typeof e==`string`?oe(e):e,a;return n?(n=Pe(n),a=n.startsWith(`/`)?ke(n.substring(1),`/`):ke(n,t)):a=t,{pathname:a,search:Re(r),hash:ze(i)}}function ke(e,t){let n=Ie(t).split(`/`);return e.split(`/`).forEach(e=>{e===`..`?n.length>1&&n.pop():e!==`.`&&n.push(e)}),n.length>1?n.join(`/`):`/`}function Ae(e,t,n,r){return`Cannot include a '${e}' character in a manually specified \`to.${t}\` field [${JSON.stringify(r)}].  Please separate it out to the \`to.${n}\` field. Alternatively you may provide the full path as a string in <Link to="..."> and the router will parse it for you.`}function je(e){return e.filter((e,t)=>t===0||e.route.path&&e.route.path.length>0)}function Me(e){let t=je(e);return t.map((e,n)=>n===t.length-1?e.pathname:e.pathnameBase)}function Ne(e,t,n,r=!1){let i;typeof e==`string`?i=oe(e):(i={...e},O(!i.pathname||!i.pathname.includes(`?`),Ae(`?`,`pathname`,`search`,i)),O(!i.pathname||!i.pathname.includes(`#`),Ae(`#`,`pathname`,`hash`,i)),O(!i.search||!i.search.includes(`#`),Ae(`#`,`search`,`hash`,i)));let a=e===``||i.pathname===``,o=a?`/`:i.pathname,s;if(o==null)s=n;else{let e=t.length-1;if(!r&&o.startsWith(`..`)){let t=o.split(`/`);for(;t[0]===`..`;)t.shift(),--e;i.pathname=t.join(`/`)}s=e>=0?t[e]:`/`}let c=Oe(i,s),l=o&&o!==`/`&&o.endsWith(`/`),u=(a||o===`.`)&&n.endsWith(`/`);return!c.pathname.endsWith(`/`)&&(l||u)&&(c.pathname+=`/`),c}var Pe=e=>e.replace(/[\\/]{2,}/g,`/`),Fe=e=>Pe(e.join(`/`)),Ie=e=>e.replace(/\/+$/,``),Le=e=>Ie(e).replace(/^\/*/,`/`),Re=e=>!e||e===`?`?``:e.startsWith(`?`)?e:`?`+e,ze=e=>!e||e===`#`?``:e.startsWith(`#`)?e:`#`+e,Be=class{constructor(e,t,n,r=!1){this.status=e,this.statusText=t||``,this.internal=r,n instanceof Error?(this.data=n.toString(),this.error=n):this.data=n}};function Ve(e){return e!=null&&typeof e.status==`number`&&typeof e.statusText==`string`&&typeof e.internal==`boolean`&&`data`in e}function He(e){return Fe(e.map(e=>e.route.path).filter(Boolean))||`/`}var Ue=typeof window<`u`&&window.document!==void 0&&window.document.createElement!==void 0;function We(e,t){let n=e;if(typeof n!=`string`||!C.test(n))return{absoluteURL:void 0,isExternal:!1,to:n};let r=n,i=!1;if(Ue)try{let e=new URL(window.location.href),r=w.test(n)?new URL(T(n,e.protocol)):new URL(n),a=De(r.pathname,t);r.origin===e.origin&&a!=null?n=a+r.search+r.hash:i=!0}catch{te(!1,`<Link to="${n}"> contains an invalid URL which will probably break when clicked - please update to a valid URL path.`)}return{absoluteURL:r,isExternal:i,to:n}}Object.getOwnPropertyNames(Object.prototype).sort().join(`\0`);var Ge=[`POST`,`PUT`,`PATCH`,`DELETE`];new Set(Ge);var Ke=[`GET`,...Ge];new Set(Ke);var qe=[`about:`,`blob:`,`chrome:`,`chrome-untrusted:`,`content:`,`data:`,`devtools:`,`file:`,`filesystem:`,`javascript:`];function Je(e){try{return qe.includes(new URL(e).protocol)}catch{return!1}}var Ye=S.createContext(null);Ye.displayName=`DataRouter`;var Xe=S.createContext(null);Xe.displayName=`DataRouterState`;var Ze=S.createContext(!1);function Qe(){return S.useContext(Ze)}var $e=S.createContext({isTransitioning:!1});$e.displayName=`ViewTransition`;var et=S.createContext(new Map);et.displayName=`Fetchers`;var tt=S.createContext(null);tt.displayName=`Await`;var nt=S.createContext(null);nt.displayName=`Navigation`;var rt=S.createContext(null);rt.displayName=`Location`;var it=S.createContext({outlet:null,matches:[],isDataRoute:!1});it.displayName=`Route`;var at=S.createContext(null);at.displayName=`RouteError`;var ot=`REACT_ROUTER_ERROR`,st=`REDIRECT`,ct=`ROUTE_ERROR_RESPONSE`;function lt(e){if(e.startsWith(`${ot}:${st}:{`))try{let t=JSON.parse(e.slice(28));if(typeof t==`object`&&t&&typeof t.status==`number`&&typeof t.statusText==`string`&&typeof t.location==`string`&&typeof t.reloadDocument==`boolean`&&typeof t.replace==`boolean`)return t}catch{}}function ut(e){if(e.startsWith(`${ot}:${ct}:{`))try{let t=JSON.parse(e.slice(40));if(typeof t==`object`&&t&&typeof t.status==`number`&&typeof t.statusText==`string`)return new Be(t.status,t.statusText,t.data)}catch{}}function dt(e,{relative:t}={}){O(ft(),`useHref() may be used only in the context of a <Router> component.`);let{basename:n,navigator:r}=S.useContext(nt),{hash:i,pathname:a,search:o}=bt(e,{relative:t}),s=a;return n!==`/`&&(s=a===`/`?n:Fe([n,a])),r.createHref({pathname:s,search:o,hash:i})}function ft(){return S.useContext(rt)!=null}function pt(){return O(ft(),`useLocation() may be used only in the context of a <Router> component.`),S.useContext(rt).location}var mt=`You should call navigate() in a React.useEffect(), not when your component is first rendered.`;function ht(e){S.useContext(nt).static||S.useLayoutEffect(e)}function gt(){let{isDataRoute:e}=S.useContext(it);return e?Lt():_t()}function _t(){O(ft(),`useNavigate() may be used only in the context of a <Router> component.`);let e=S.useContext(Ye),{basename:t,navigator:n}=S.useContext(nt),{matches:r}=S.useContext(it),{pathname:i}=pt(),a=JSON.stringify(Me(r)),o=S.useRef(!1);return ht(()=>{o.current=!0}),S.useCallback((r,s={})=>{if(te(o.current,mt),!o.current)return;if(typeof r==`number`){n.go(r);return}let c=Ne(r,JSON.parse(a),i,s.relative===`path`);e==null&&t!==`/`&&(c.pathname=c.pathname===`/`?t:Fe([t,c.pathname])),(s.replace?n.replace:n.push)(c,s.state,s)},[t,n,a,i,e])}var vt=S.createContext(null);function yt(e){let t=S.useContext(it).outlet;return S.useMemo(()=>t&&S.createElement(vt.Provider,{value:e},t),[t,e])}function bt(e,{relative:t}={}){let{matches:n}=S.useContext(it),{pathname:r}=pt(),i=JSON.stringify(Me(n));return S.useMemo(()=>Ne(e,JSON.parse(i),r,t===`path`),[e,i,r,t])}function xt(e,t){return St(e,t)}function St(e,t,n){O(ft(),`useRoutes() may be used only in the context of a <Router> component.`);let{navigator:r}=S.useContext(nt),{matches:i}=S.useContext(it),a=i[i.length-1],o=a?a.params:{},s=a?a.pathname:`/`,c=a?a.pathnameBase:`/`,l=a&&a.route;{let e=l&&l.path||``;zt(s,!l||e.endsWith(`*`)||e.endsWith(`*?`),`You rendered descendant <Routes> (or called \`useRoutes()\`) at "${s}" (under <Route path="${e}">) but the parent route path has no trailing "*". This means if you navigate deeper, the parent won't match anymore and therefore the child routes will never render.

Please change the parent <Route path="${e}"> to <Route path="${e===`/`?`*`:`${e}/*`}">.`)}let u=pt(),d;if(t){let e=typeof t==`string`?oe(t):t;O(c===`/`||e.pathname?.startsWith(c),`When overriding the location using \`<Routes location>\` or \`useRoutes(routes, location)\`, the location pathname must begin with the portion of the URL pathname that was matched by all parent routes. The current pathname base is "${c}" but pathname "${e.pathname}" was given in the \`location\` prop.`),d=e}else d=u;let f=d.pathname||`/`,p=f;if(c!==`/`){let e=c.replace(/^\//,``).split(`/`);p=`/`+f.replace(/^\//,``).split(`/`).slice(e.length).join(`/`)}let m=n&&n.state.matches.length?n.state.matches.map(e=>Object.assign(e,{route:n.manifest[e.route.id]||e.route})):se(e,{pathname:p});te(l||m!=null,`No routes matched location "${d.pathname}${d.search}${d.hash}" `),te(m==null||m[m.length-1].route.element!==void 0||m[m.length-1].route.Component!==void 0||m[m.length-1].route.lazy!==void 0,`Matched leaf route at location "${d.pathname}${d.search}${d.hash}" does not have an element or Component. This means it will render an <Outlet /> with a null value by default resulting in an "empty" page.`);let h=kt(m&&m.map(e=>Object.assign({},e,{params:Object.assign({},o,e.params),pathname:Fe([c,r.encodeLocation?r.encodeLocation(e.pathname.replace(/%/g,`%25`).replace(/\?/g,`%3F`).replace(/#/g,`%23`)).pathname:e.pathname]),pathnameBase:e.pathnameBase===`/`?c:Fe([c,r.encodeLocation?r.encodeLocation(e.pathnameBase.replace(/%/g,`%25`).replace(/\?/g,`%3F`).replace(/#/g,`%23`)).pathname:e.pathnameBase])})),i,n);return t&&h?S.createElement(rt.Provider,{value:{location:{pathname:`/`,search:``,hash:``,state:null,key:`default`,mask:void 0,...d},navigationType:`POP`}},h):h}function Ct(){let e=It(),t=Ve(e)?`${e.status} ${e.statusText}`:e instanceof Error?e.message:JSON.stringify(e),n=e instanceof Error?e.stack:null,r=`rgba(200,200,200, 0.5)`,i={padding:`0.5rem`,backgroundColor:r},a={padding:`2px 4px`,backgroundColor:r},o=null;return console.error(`Error handled by React Router default ErrorBoundary:`,e),o=S.createElement(S.Fragment,null,S.createElement(`p`,null,`💿 Hey developer 👋`),S.createElement(`p`,null,`You can provide a way better UX than this when your app throws errors by providing your own `,S.createElement(`code`,{style:a},`ErrorBoundary`),` or`,` `,S.createElement(`code`,{style:a},`errorElement`),` prop on your route.`)),S.createElement(S.Fragment,null,S.createElement(`h2`,null,`Unexpected Application Error!`),S.createElement(`h3`,{style:{fontStyle:`italic`}},t),n?S.createElement(`pre`,{style:i},n):null,o)}var wt=S.createElement(Ct,null),Tt=class extends S.Component{constructor(e){super(e),this.state={location:e.location,revalidation:e.revalidation,error:e.error}}static getDerivedStateFromError(e){return{error:e}}static getDerivedStateFromProps(e,t){return t.location!==e.location||t.revalidation!==`idle`&&e.revalidation===`idle`?{error:e.error,location:e.location,revalidation:e.revalidation}:{error:e.error===void 0?t.error:e.error,location:t.location,revalidation:e.revalidation||t.revalidation}}componentDidCatch(e,t){this.props.onError?this.props.onError(e,t):console.error(`React Router caught the following error during render`,e)}render(){let e=this.state.error;if(this.context&&typeof e==`object`&&e&&`digest`in e&&typeof e.digest==`string`){let t=ut(e.digest);t&&(e=t)}let t=e===void 0?this.props.children:S.createElement(it.Provider,{value:this.props.routeContext},S.createElement(at.Provider,{value:e,children:this.props.component}));return this.context?S.createElement(Dt,{error:e},t):t}};Tt.contextType=Ze;var Et=new WeakMap;function Dt({children:e,error:t}){let{basename:n}=S.useContext(nt);if(typeof t==`object`&&t&&`digest`in t&&typeof t.digest==`string`){let e=lt(t.digest);if(e){let r=Et.get(t);if(r)throw r;let i=We(e.location,n),a=i.absoluteURL||i.to;if(Je(a))throw Error(`Invalid redirect location`);if(Ue&&!Et.get(t)){if(i.isExternal||e.reloadDocument)window.location.href=a;else{let n=Promise.resolve().then(()=>window.__reactRouterDataRouter.navigate(i.to,{replace:e.replace}));throw Et.set(t,n),n}}return S.createElement(`meta`,{httpEquiv:`refresh`,content:`0;url=${a}`})}}return e}function Ot({routeContext:e,match:t,children:n}){let r=S.useContext(Ye);return r&&r.static&&r.staticContext&&(t.route.errorElement||t.route.ErrorBoundary)&&(r.staticContext._deepestRenderedBoundaryId=t.route.id),S.createElement(it.Provider,{value:e},n)}function kt(e,t=[],n){let r=n?.state;if(e==null){if(!r)return null;if(r.errors)e=r.matches;else if(t.length===0&&!r.initialized&&r.matches.length>0)e=r.matches;else return null}let i=e,a=r?.errors;if(a!=null){let e=i.findIndex(e=>e.route.id&&a?.[e.route.id]!==void 0);O(e>=0,`Could not find a matching route for errors on route IDs: ${Object.keys(a).join(`,`)}`),i=i.slice(0,Math.min(i.length,e+1))}let o=!1,s=-1;if(n&&r){o=r.renderFallback;for(let e=0;e<i.length;e++){let t=i[e];if((t.route.HydrateFallback||t.route.hydrateFallbackElement)&&(s=e),t.route.id){let{loaderData:e,errors:a}=r,c=t.route.loader&&!e.hasOwnProperty(t.route.id)&&(!a||a[t.route.id]===void 0);if(t.route.lazy||c){n.isStatic&&(o=!0),i=s>=0?i.slice(0,s+1):[i[0]];break}}}}let c=n?.onError,l=r&&c?(e,t)=>{c(e,{location:r.location,params:r.matches?.[0]?.params??{},pattern:He(r.matches),errorInfo:t})}:void 0;return i.reduceRight((e,n,c)=>{let u,d=!1,f=null,p=null;r&&(u=a&&n.route.id?a[n.route.id]:void 0,f=n.route.errorElement||wt,o&&(s<0&&c===0?(zt(`route-fallback`,!1,"No `HydrateFallback` element provided to render during initial hydration"),d=!0,p=null):s===c&&(d=!0,p=n.route.hydrateFallbackElement||null)));let m=t.concat(i.slice(0,c+1)),h=()=>{let t;return t=u?f:d?p:n.route.Component?S.createElement(n.route.Component,null):n.route.element?n.route.element:e,S.createElement(Ot,{match:n,routeContext:{outlet:e,matches:m,isDataRoute:r!=null},children:t})};return r&&(n.route.ErrorBoundary||n.route.errorElement||c===0)?S.createElement(Tt,{location:r.location,revalidation:r.revalidation,component:f,error:u,children:h(),routeContext:{outlet:null,matches:m,isDataRoute:!0},onError:l}):h()},null)}function At(e){return`${e} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`}function jt(e){let t=S.useContext(Ye);return O(t,At(e)),t}function Mt(e){let t=S.useContext(Xe);return O(t,At(e)),t}function Nt(e){let t=S.useContext(it);return O(t,At(e)),t}function Pt(e){let t=Nt(e),n=t.matches[t.matches.length-1];return O(n.route.id,`${e} can only be used on routes that contain a unique "id"`),n.route.id}function Ft(){return Pt(`useRouteId`)}function It(){let e=S.useContext(at),t=Mt(`useRouteError`),n=Pt(`useRouteError`);return e===void 0?t.errors?.[n]:e}function Lt(){let{router:e}=jt(`useNavigate`),t=Pt(`useNavigate`),n=S.useRef(!1);return ht(()=>{n.current=!0}),S.useCallback(async(r,i={})=>{te(n.current,mt),n.current&&(typeof r==`number`?await e.navigate(r):await e.navigate(r,{fromRouteId:t,...i}))},[e,t])}var Rt={};function zt(e,t,n){!t&&!Rt[e]&&(Rt[e]=!0,te(!1,n))}S.memo(Bt);function Bt({routes:e,manifest:t,future:n,state:r,isStatic:i,onError:a}){return St(e,void 0,{manifest:t,state:r,isStatic:i,onError:a,future:n})}function Vt({to:e,replace:t,state:n,relative:r}){O(ft(),`<Navigate> may be used only in the context of a <Router> component.`);let{static:i}=S.useContext(nt);te(!i,`<Navigate> must not be used on the initial render in a <StaticRouter>. This is a no-op, but you should modify your code so the <Navigate> is only ever rendered in response to some user interaction or state change.`);let{matches:a}=S.useContext(it),{pathname:o}=pt(),s=gt(),c=Ne(e,Me(a),o,r===`path`),l=JSON.stringify(c);return S.useEffect(()=>{s(JSON.parse(l),{replace:t,state:n,relative:r})},[s,l,r,t,n]),null}function Ht(e){return yt(e.context)}function Ut(e){O(!1,`A <Route> is only ever to be used as the child of <Routes> element, never rendered directly. Please wrap your <Route> in a <Routes>.`)}function Wt({basename:e=`/`,children:t=null,location:n,navigationType:r=`POP`,navigator:i,static:a=!1,useTransitions:o}){O(!ft(),`You cannot render a <Router> inside another <Router>. You should never have more than one in your app.`);let s=e.replace(/^\/*/,`/`),c=S.useMemo(()=>({basename:s,navigator:i,static:a,useTransitions:o,future:{}}),[s,i,a,o]);typeof n==`string`&&(n=oe(n));let{pathname:l=`/`,search:u=``,hash:d=``,state:f=null,key:p=`default`,mask:m}=n,h=S.useMemo(()=>{let e=De(l,s);return e==null?null:{location:{pathname:e,search:u,hash:d,state:f,key:p,mask:m},navigationType:r}},[s,l,u,d,f,p,r,m]);return te(h!=null,`<Router basename="${s}"> is not able to match the URL "${l}${u}${d}" because it does not start with the basename, so the <Router> won't render anything.`),h==null?null:S.createElement(nt.Provider,{value:c},S.createElement(rt.Provider,{children:t,value:h}))}function Gt({children:e,location:t}){return xt(Kt(e),t)}S.Component;function Kt(e,t=[]){let n=[];return S.Children.forEach(e,(e,r)=>{if(!S.isValidElement(e))return;let i=[...t,r];if(e.type===S.Fragment){n.push.apply(n,Kt(e.props.children,i));return}O(e.type===Ut,`[${typeof e.type==`string`?e.type:e.type.name}] is not a <Route> component. All component children of <Routes> must be a <Route> or <React.Fragment>`),O(!e.props.index||!e.props.children,`An index route cannot have child routes.`);let a={id:e.props.id||i.join(`-`),caseSensitive:e.props.caseSensitive,element:e.props.element,Component:e.props.Component,index:e.props.index,path:e.props.path,middleware:e.props.middleware,loader:e.props.loader,action:e.props.action,hydrateFallbackElement:e.props.hydrateFallbackElement,HydrateFallback:e.props.HydrateFallback,errorElement:e.props.errorElement,ErrorBoundary:e.props.ErrorBoundary,hasErrorBoundary:e.props.hasErrorBoundary===!0||e.props.ErrorBoundary!=null||e.props.errorElement!=null,shouldRevalidate:e.props.shouldRevalidate,handle:e.props.handle,lazy:e.props.lazy};e.props.children&&(a.children=Kt(e.props.children,i)),n.push(a)}),n}var qt=`get`,Jt=`application/x-www-form-urlencoded`;function Yt(e){return typeof HTMLElement<`u`&&e instanceof HTMLElement}function Xt(e){return Yt(e)&&e.tagName.toLowerCase()===`button`}function Zt(e){return Yt(e)&&e.tagName.toLowerCase()===`form`}function Qt(e){return Yt(e)&&e.tagName.toLowerCase()===`input`}function $t(e){return!!(e.metaKey||e.altKey||e.ctrlKey||e.shiftKey)}function en(e,t){return e.button===0&&(!t||t===`_self`)&&!$t(e)}var tn=null;function nn(){if(tn===null)try{new FormData(document.createElement(`form`),0),tn=!1}catch{tn=!0}return tn}var rn=new Set([`application/x-www-form-urlencoded`,`multipart/form-data`,`text/plain`]);function an(e){return e!=null&&!rn.has(e)?(te(!1,`"${e}" is not a valid \`encType\` for \`<Form>\`/\`<fetcher.Form>\` and will default to "${Jt}"`),null):e}function on(e,t){let n,r,i,a,o;if(Zt(e)){let o=e.getAttribute(`action`);r=o?De(o,t):null,n=e.getAttribute(`method`)||qt,i=an(e.getAttribute(`enctype`))||Jt,a=new FormData(e)}else if(Xt(e)||Qt(e)&&(e.type===`submit`||e.type===`image`)){let o=e.form;if(o==null)throw Error(`Cannot submit a <button> or <input type="submit"> without a <form>`);let s=e.getAttribute(`formaction`)||o.getAttribute(`action`);if(r=s?De(s,t):null,n=e.getAttribute(`formmethod`)||o.getAttribute(`method`)||qt,i=an(e.getAttribute(`formenctype`))||an(o.getAttribute(`enctype`))||Jt,a=new FormData(o,e),!nn()){let{name:t,type:n,value:r}=e;if(n===`image`){let e=t?`${t}.`:``;a.append(`${e}x`,`0`),a.append(`${e}y`,`0`)}else t&&a.append(t,r)}}else if(Yt(e))throw Error(`Cannot submit element that is not <form>, <button>, or <input type="submit|image">`);else n=qt,r=null,i=Jt,o=e;return a&&i===`text/plain`&&(o=a,a=void 0),{action:r,method:n.toLowerCase(),encType:i,formData:a,body:o}}Object.getOwnPropertyNames(Object.prototype).sort().join(`\0`);function sn(e,t){if(e===!1||e==null)throw Error(t)}function cn(e,t,n,r){let i=typeof e==`string`?new URL(e,typeof window>`u`?`server://singlefetch/`:window.location.origin):e;return i.pathname=n?i.pathname.endsWith(`/`)?`${i.pathname}_.${r}`:`${i.pathname}.${r}`:i.pathname===`/`?`_root.${r}`:t&&De(i.pathname,t)===`/`?`${Ie(t)}/_root.${r}`:`${Ie(i.pathname)}.${r}`,i}async function ln(e,t){if(e.id in t)return t[e.id];try{let n=await x(()=>import(e.module),[]);return t[e.id]=n,n}catch(t){return console.error(`Error loading route module \`${e.module}\`, reloading page...`),console.error(t),window.__reactRouterContext&&window.__reactRouterContext.isSpaMode,window.location.reload(),new Promise(()=>{})}}function un(e){return e!=null&&typeof e.page==`string`}function dn(e){return e==null?!1:e.href==null?e.rel===`preload`&&typeof e.imageSrcSet==`string`&&typeof e.imageSizes==`string`:typeof e.rel==`string`&&typeof e.href==`string`}async function fn(e,t,n){return _n((await Promise.all(e.map(async e=>{let r=t.routes[e.route.id];if(r){let e=await ln(r,n);return e.links?e.links():[]}return[]}))).flat(1).filter(dn).filter(e=>e.rel===`stylesheet`||e.rel===`preload`).map(e=>e.rel===`stylesheet`?{...e,rel:`prefetch`,as:`style`}:{...e,rel:`prefetch`}))}function pn(e,t,n,r,i,a){let o=(e,t)=>!n[t]||e.route.id!==n[t].route.id,s=(e,t)=>n[t].pathname!==e.pathname||n[t].route.path?.endsWith(`*`)&&n[t].params[`*`]!==e.params[`*`];return a===`assets`?t.filter((e,t)=>o(e,t)||s(e,t)):a===`data`?t.filter((t,a)=>{let c=r.routes[t.route.id];if(!c||!c.hasLoader)return!1;if(o(t,a)||s(t,a))return!0;if(t.route.shouldRevalidate){let r=t.route.shouldRevalidate({currentUrl:new URL(i.pathname+i.search+i.hash,window.origin),currentParams:n[0]?.params||{},nextUrl:new URL(e,window.origin),nextParams:t.params,defaultShouldRevalidate:!0});if(typeof r==`boolean`)return r}return!0}):[]}function mn(e,t,{includeHydrateFallback:n}={}){return hn(e.map(e=>{let r=t.routes[e.route.id];if(!r)return[];let i=[r.module];return r.clientActionModule&&(i=i.concat(r.clientActionModule)),r.clientLoaderModule&&(i=i.concat(r.clientLoaderModule)),n&&r.hydrateFallbackModule&&(i=i.concat(r.hydrateFallbackModule)),r.imports&&(i=i.concat(r.imports)),i}).flat(1))}function hn(e){return[...new Set(e)]}function gn(e){let t={},n=Object.keys(e).sort();for(let r of n)t[r]=e[r];return t}function _n(e,t){let n=new Set,r=new Set(t);return e.reduce((e,i)=>{if(t&&!un(i)&&i.as===`script`&&i.href&&r.has(i.href))return e;let a=JSON.stringify(gn(i));return n.has(a)||(n.add(a),e.push({key:a,link:i})),e},[])}function vn(){let e=S.useContext(Ye);return sn(e,`You must render this element inside a <DataRouterContext.Provider> element`),e}function yn(){let e=S.useContext(Xe);return sn(e,`You must render this element inside a <DataRouterStateContext.Provider> element`),e}var bn=S.createContext(void 0);bn.displayName=`FrameworkContext`;function xn(){let e=S.useContext(bn);return sn(e,`You must render this element inside a <HydratedRouter> element`),e}function Sn(e,t){let n=S.useContext(bn),[r,i]=S.useState(!1),[a,o]=S.useState(!1),{onFocus:s,onBlur:c,onMouseEnter:l,onMouseLeave:u,onTouchStart:d}=t,f=S.useRef(null);S.useEffect(()=>{if(e===`render`&&o(!0),e===`viewport`){let e=new IntersectionObserver(e=>{e.forEach(e=>{o(e.isIntersecting)})},{threshold:.5});return f.current&&e.observe(f.current),()=>{e.disconnect()}}},[e]),S.useEffect(()=>{if(r){let e=setTimeout(()=>{o(!0)},100);return()=>{clearTimeout(e)}}},[r]);let p=()=>{i(!0)},m=()=>{i(!1),o(!1)};return n?e===`intent`?[a,f,{onFocus:Cn(s,p),onBlur:Cn(c,m),onMouseEnter:Cn(l,p),onMouseLeave:Cn(u,m),onTouchStart:Cn(d,p)}]:[a,f,{}]:[!1,f,{}]}function Cn(e,t){return n=>{e&&e(n),n.defaultPrevented||t(n)}}function wn({page:e,...t}){let n=Qe(),{nonce:r}=xn(),{router:i}=vn(),a=S.useMemo(()=>se(i.routes,e,i.basename),[i.routes,e,i.basename]);return a?(t.nonce==null&&r&&(t={...t,nonce:r}),n?S.createElement(En,{page:e,matches:a,...t}):S.createElement(Dn,{page:e,matches:a,...t})):null}function Tn(e){let{manifest:t,routeModules:n}=xn(),[r,i]=S.useState([]);return S.useEffect(()=>{let r=!1;return fn(e,t,n).then(e=>{r||i(e)}),()=>{r=!0}},[e,t,n]),r}function En({page:e,matches:t,...n}){let r=pt(),{future:i}=xn(),{basename:a}=vn(),o=S.useMemo(()=>{if(e===r.pathname+r.search+r.hash)return[];let n=cn(e,a,i.v8_trailingSlashAwareDataRequests,`rsc`),o=!1,s=[];for(let e of t)typeof e.route.shouldRevalidate==`function`?o=!0:s.push(e.route.id);return o&&s.length>0&&n.searchParams.set(`_routes`,s.join(`,`)),[n.pathname+n.search]},[a,i.v8_trailingSlashAwareDataRequests,e,r,t]);return S.createElement(S.Fragment,null,o.map(e=>S.createElement(`link`,{key:e,rel:`prefetch`,as:`fetch`,href:e,...n})))}function Dn({page:e,matches:t,...n}){let r=pt(),{future:i,manifest:a,routeModules:o}=xn(),{basename:s}=vn(),{loaderData:c,matches:l}=yn(),u=S.useMemo(()=>pn(e,t,l,a,r,`data`),[e,t,l,a,r]),d=S.useMemo(()=>pn(e,t,l,a,r,`assets`),[e,t,l,a,r]),f=S.useMemo(()=>{if(e===r.pathname+r.search+r.hash)return[];let n=new Set,l=!1;if(t.forEach(e=>{let t=a.routes[e.route.id];!t||!t.hasLoader||(!u.some(t=>t.route.id===e.route.id)&&e.route.id in c&&o[e.route.id]?.shouldRevalidate||t.hasClientLoader?l=!0:n.add(e.route.id))}),n.size===0)return[];let d=cn(e,s,i.v8_trailingSlashAwareDataRequests,`data`);return l&&n.size>0&&d.searchParams.set(`_routes`,t.filter(e=>n.has(e.route.id)).map(e=>e.route.id).join(`,`)),[d.pathname+d.search]},[s,i.v8_trailingSlashAwareDataRequests,c,r,a,u,t,e,o]),p=S.useMemo(()=>mn(d,a),[d,a]),m=Tn(d);return S.createElement(S.Fragment,null,f.map(e=>S.createElement(`link`,{key:e,rel:`prefetch`,as:`fetch`,href:e,...n})),p.map(e=>S.createElement(`link`,{key:e,rel:`modulepreload`,href:e,...n})),m.map(({key:e,link:t})=>S.createElement(`link`,{key:e,nonce:n.nonce,...t,crossOrigin:t.crossOrigin??n.crossOrigin})))}function On(...e){return t=>{e.forEach(e=>{typeof e==`function`?e(t):e!=null&&(e.current=t)})}}S.Component;var kn=typeof window<`u`&&window.document!==void 0&&window.document.createElement!==void 0;try{kn&&(window.__reactRouterVersion=`7.18.2`)}catch{}function An({basename:e,children:t,useTransitions:n,window:r}){let i=S.useRef();i.current??=D({window:r,v5Compat:!0});let a=i.current,[o,s]=S.useState({action:a.action,location:a.location}),c=S.useCallback(e=>{n===!1?s(e):S.startTransition(()=>s(e))},[n]);return S.useLayoutEffect(()=>a.listen(c),[a,c]),S.createElement(Wt,{basename:e,children:t,location:o.location,navigationType:o.action,navigator:a,useTransitions:n})}var jn=S.forwardRef(function({onClick:e,discover:t=`render`,prefetch:n=`none`,relative:r,reloadDocument:i,replace:a,mask:o,state:s,target:c,to:l,preventScrollReset:u,viewTransition:d,defaultShouldRevalidate:f,...p},m){let{basename:h,navigator:g,useTransitions:_}=S.useContext(nt),v=typeof l==`string`&&C.test(l),y=We(l,h);l=y.to;let b=dt(l,{relative:r}),x=pt(),w=null;if(o){let e=Ne(o,[],x.mask?x.mask.pathname:`/`,!0);h!==`/`&&(e.pathname=e.pathname===`/`?h:Fe([h,e.pathname])),w=g.createHref(e)}let[T,E,ee]=Sn(n,p),D=In(l,{replace:a,mask:o,state:s,target:c,preventScrollReset:u,relative:r,viewTransition:d,defaultShouldRevalidate:f,useTransitions:_});function O(t){e&&e(t),t.defaultPrevented||D(t)}let te=!(y.isExternal||i),ne=S.createElement(`a`,{...p,...ee,href:(te?w:void 0)||y.absoluteURL||b,onClick:te?O:e,ref:On(m,E),target:c,"data-discover":!v&&t===`render`?`true`:void 0});return T&&!v?S.createElement(S.Fragment,null,ne,S.createElement(wn,{page:b})):ne});jn.displayName=`Link`;var Mn=S.forwardRef(function({"aria-current":e=`page`,caseSensitive:t=!1,className:n=``,end:r=!1,style:i,to:a,viewTransition:o,children:s,...c},l){let u=bt(a,{relative:c.relative}),d=pt(),f=S.useContext(Xe),{navigator:p,basename:m}=S.useContext(nt),h=f!=null&&Vn(u)&&o===!0,g=p.encodeLocation?p.encodeLocation(u).pathname:u.pathname,_=d.pathname,v=f&&f.navigation&&f.navigation.location?f.navigation.location.pathname:null;t||(_=_.toLowerCase(),v=v?v.toLowerCase():null,g=g.toLowerCase()),v&&m&&(v=De(v,m)||v);let y=g!==`/`&&g.endsWith(`/`)?g.length-1:g.length,b=_===g||!r&&_.startsWith(g)&&_.charAt(y)===`/`,x=v!=null&&(v===g||!r&&v.startsWith(g)&&v.charAt(g.length)===`/`),C={isActive:b,isPending:x,isTransitioning:h},w=b?e:void 0,T;T=typeof n==`function`?n(C):[n,b?`active`:null,x?`pending`:null,h?`transitioning`:null].filter(Boolean).join(` `);let E=typeof i==`function`?i(C):i;return S.createElement(jn,{...c,"aria-current":w,className:T,ref:l,style:E,to:a,viewTransition:o},typeof s==`function`?s(C):s)});Mn.displayName=`NavLink`;var Nn=S.forwardRef(({discover:e=`render`,fetcherKey:t,navigate:n,reloadDocument:r,replace:i,state:a,method:o=qt,action:s,onSubmit:c,relative:l,preventScrollReset:u,viewTransition:d,defaultShouldRevalidate:f,...p},m)=>{let{useTransitions:h}=S.useContext(nt),g=zn(),_=Bn(s,{relative:l}),v=o.toLowerCase()===`get`?`get`:`post`,y=typeof s==`string`&&C.test(s);return S.createElement(`form`,{ref:m,method:v,action:_,onSubmit:r?c:e=>{if(c&&c(e),e.defaultPrevented)return;e.preventDefault();let r=e.nativeEvent.submitter,s=r?.getAttribute(`formmethod`)||o,p=()=>g(r||e.currentTarget,{fetcherKey:t,method:s,navigate:n,replace:i,state:a,relative:l,preventScrollReset:u,viewTransition:d,defaultShouldRevalidate:f});h&&n!==!1?S.startTransition(()=>p()):p()},...p,"data-discover":!y&&e===`render`?`true`:void 0})});Nn.displayName=`Form`;function Pn(e){return`${e} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`}function Fn(e){let t=S.useContext(Ye);return O(t,Pn(e)),t}function In(e,{target:t,replace:n,mask:r,state:i,preventScrollReset:a,relative:o,viewTransition:s,defaultShouldRevalidate:c,useTransitions:l}={}){let u=gt(),d=pt(),f=bt(e,{relative:o});return S.useCallback(p=>{if(en(p,t)){p.preventDefault();let t=n===void 0?ae(d)===ae(f):n,m=()=>u(e,{replace:t,mask:r,state:i,preventScrollReset:a,relative:o,viewTransition:s,defaultShouldRevalidate:c});l?S.startTransition(()=>m()):m()}},[d,u,f,n,r,i,t,e,a,o,s,c,l])}var Ln=0,Rn=()=>`__${String(++Ln)}__`;function zn(){let{router:e}=Fn(`useSubmit`),{basename:t}=S.useContext(nt),n=Ft(),r=e.fetch,i=e.navigate;return S.useCallback(async(e,a={})=>{let{action:o,method:s,encType:c,formData:l,body:u}=on(e,t);if(a.navigate===!1){let e=a.fetcherKey||Rn();await r(e,n,a.action||o,{defaultShouldRevalidate:a.defaultShouldRevalidate,preventScrollReset:a.preventScrollReset,formData:l,body:u,formMethod:a.method||s,formEncType:a.encType||c,flushSync:a.flushSync})}else await i(a.action||o,{defaultShouldRevalidate:a.defaultShouldRevalidate,preventScrollReset:a.preventScrollReset,formData:l,body:u,formMethod:a.method||s,formEncType:a.encType||c,replace:a.replace,state:a.state,fromRouteId:n,flushSync:a.flushSync,viewTransition:a.viewTransition})},[r,i,t,n])}function Bn(e,{relative:t}={}){let{basename:n}=S.useContext(nt),r=S.useContext(it);O(r,`useFormAction must be used inside a RouteContext`);let[i]=r.matches.slice(-1),a={...bt(e||`.`,{relative:t})},o=pt();if(e==null){a.search=o.search;let e=new URLSearchParams(a.search),t=e.getAll(`index`);if(t.some(e=>e===``)){e.delete(`index`),t.filter(e=>e).forEach(t=>e.append(`index`,t));let n=e.toString();a.search=n?`?${n}`:``}}return(!e||e===`.`)&&i.route.index&&(a.search=a.search?a.search.replace(/^\?/,`?index&`):`?index`),n!==`/`&&(a.pathname=a.pathname===`/`?n:Fe([n,a.pathname])),ae(a)}function Vn(e,{relative:t}={}){let n=S.useContext($e);O(n!=null,"`useViewTransitionState` must be used within `react-router-dom`'s `RouterProvider`.  Did you accidentally import `RouterProvider` from `react-router`?");let{basename:r}=Fn(`useViewTransitionState`),i=bt(e,{relative:t});if(!n.isTransitioning)return!1;let a=De(n.currentLocation.pathname,r)||n.currentLocation.pathname,o=De(n.nextLocation.pathname,r)||n.nextLocation.pathname;return Ce(i.pathname,o)!=null||Ce(i.pathname,a)!=null}var Hn=_(),j=e=>typeof e==`string`,Un=()=>{let e,t,n=new Promise((n,r)=>{e=n,t=r});return n.resolve=e,n.reject=t,n},Wn=e=>e==null?``:String(e),Gn=(e,t,n)=>{e.forEach(e=>{t[e]&&(n[e]=t[e])})},Kn=/###/g,qn=e=>e&&e.includes(`###`)?e.replace(Kn,`.`):e,Jn=e=>!e||j(e),Yn=(e,t,n)=>{let r=j(t)?t.split(`.`):t,i=0;for(;i<r.length-1;){if(Jn(e))return{};let t=qn(r[i]);!e[t]&&n&&(e[t]=new n),e=Object.prototype.hasOwnProperty.call(e,t)?e[t]:{},++i}return Jn(e)?{}:{obj:e,k:qn(r[i])}},Xn=(e,t,n)=>{let{obj:r,k:i}=Yn(e,t,Object);if(r!==void 0||t.length===1){r[i]=n;return}let a=t[t.length-1],o=t.slice(0,t.length-1),s=Yn(e,o,Object);for(;s.obj===void 0&&o.length;)a=`${o[o.length-1]}.${a}`,o=o.slice(0,o.length-1),s=Yn(e,o,Object),s?.obj&&s.obj[`${s.k}.${a}`]!==void 0&&(s.obj=void 0);s.obj[`${s.k}.${a}`]=n},Zn=(e,t,n,r)=>{let{obj:i,k:a}=Yn(e,t,Object);i[a]=i[a]||[],i[a].push(n)},Qn=(e,t)=>{let{obj:n,k:r}=Yn(e,t);if(n&&Object.prototype.hasOwnProperty.call(n,r))return n[r]},$n=(e,t,n)=>{let r=Qn(e,n);return r===void 0?Qn(t,n):r},er=(e,t,n)=>{for(let r in t)r!==`__proto__`&&r!==`constructor`&&(Object.prototype.hasOwnProperty.call(e,r)?j(e[r])||e[r]instanceof String||j(t[r])||t[r]instanceof String?n&&(e[r]=t[r]):er(e[r],t[r],n):e[r]=t[r]);return e},tr=e=>e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,`\\$&`),nr={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`,"/":`&#x2F;`},rr=e=>j(e)?e.replace(/[&<>"'\/]/g,e=>nr[e]):e,ir=class{constructor(e){this.capacity=e,this.regExpMap=new Map,this.regExpQueue=[]}getRegExp(e){let t=this.regExpMap.get(e);if(t!==void 0)return t;let n=new RegExp(e);return this.regExpQueue.length===this.capacity&&this.regExpMap.delete(this.regExpQueue.shift()),this.regExpMap.set(e,n),this.regExpQueue.push(e),n}},ar=[` `,`,`,`?`,`!`,`;`],or=new ir(20),sr=(e,t,n)=>{t||=``,n||=``;let r=ar.filter(e=>!t.includes(e)&&!n.includes(e));if(r.length===0)return!0;let i=or.getRegExp(`(${r.map(e=>e===`?`?`\\?`:e).join(`|`)})`),a=!i.test(e);if(!a){let t=e.indexOf(n);t>0&&!i.test(e.substring(0,t))&&(a=!0)}return a},cr=(e,t,n=`.`)=>{if(!e)return;if(e[t])return Object.prototype.hasOwnProperty.call(e,t)?e[t]:void 0;let r=t.split(n),i=e;for(let e=0;e<r.length;){if(!i||typeof i!=`object`)return;let t,a=``;for(let o=e;o<r.length;++o)if(o!==e&&(a+=n),a+=r[o],t=i[a],t!==void 0){if([`string`,`number`,`boolean`].includes(typeof t)&&o<r.length-1)continue;e+=o-e+1;break}i=t}return i},lr=e=>e?.replace(/_/g,`-`),ur={type:`logger`,log(e){this.output(`log`,e)},warn(e){this.output(`warn`,e)},error(e){this.output(`error`,e)},output(e,t){console?.[e]?.apply?.(console,t)}},dr=new class e{constructor(e,t={}){this.init(e,t)}init(e,t={}){this.prefix=t.prefix||`i18next:`,this.logger=e||ur,this.options=t,this.debug=t.debug}log(...e){return this.forward(e,`log`,``,!0)}warn(...e){return this.forward(e,`warn`,``,!0)}error(...e){return this.forward(e,`error`,``)}deprecate(...e){return this.forward(e,`warn`,`WARNING DEPRECATED: `,!0)}forward(e,t,n,r){return r&&!this.debug?null:(e=e.map(e=>j(e)?e.replace(/[\r\n\x00-\x1F\x7F]/g,` `):e),j(e[0])&&(e[0]=`${n}${this.prefix} ${e[0]}`),this.logger[t](e))}create(t){return new e(this.logger,{prefix:`${this.prefix}:${t}:`,...this.options})}clone(t){return t||=this.options,t.prefix=t.prefix||this.prefix,new e(this.logger,t)}},fr=class{constructor(){this.observers={}}on(e,t){return e.split(` `).forEach(e=>{this.observers[e]||(this.observers[e]=new Map);let n=this.observers[e].get(t)||0;this.observers[e].set(t,n+1)}),this}off(e,t){if(this.observers[e]){if(!t){delete this.observers[e];return}this.observers[e].delete(t)}}once(e,t){let n=(...r)=>{t(...r),this.off(e,n)};return this.on(e,n),this}emit(e,...t){this.observers[e]&&Array.from(this.observers[e].entries()).forEach(([e,n])=>{for(let r=0;r<n;r++)e(...t)}),this.observers[`*`]&&Array.from(this.observers[`*`].entries()).forEach(([n,r])=>{for(let i=0;i<r;i++)n(e,...t)})}},pr=class extends fr{constructor(e,t={ns:[`translation`],defaultNS:`translation`}){super(),this.data=e||{},this.options=t,this.options.keySeparator===void 0&&(this.options.keySeparator=`.`),this.options.ignoreJSONStructure===void 0&&(this.options.ignoreJSONStructure=!0)}addNamespaces(e){this.options.ns.includes(e)||this.options.ns.push(e)}removeNamespaces(e){let t=this.options.ns.indexOf(e);t>-1&&this.options.ns.splice(t,1)}getResource(e,t,n,r={}){let i=r.keySeparator===void 0?this.options.keySeparator:r.keySeparator,a=r.ignoreJSONStructure===void 0?this.options.ignoreJSONStructure:r.ignoreJSONStructure,o;e.includes(`.`)?o=e.split(`.`):(o=[e,t],n&&(Array.isArray(n)?o.push(...n):j(n)&&i?o.push(...n.split(i)):o.push(n)));let s=Qn(this.data,o);return!s&&!t&&!n&&e.includes(`.`)&&(e=o[0],t=o[1],n=o.slice(2).join(`.`)),s||!a||!j(n)?s:cr(this.data?.[e]?.[t],n,i)}addResource(e,t,n,r,i={silent:!1}){let a=i.keySeparator===void 0?this.options.keySeparator:i.keySeparator,o=[e,t];n&&(o=o.concat(a?n.split(a):n)),e.includes(`.`)&&(o=e.split(`.`),r=t,t=o[1]),this.addNamespaces(t),Xn(this.data,o,r),i.silent||this.emit(`added`,e,t,n,r)}addResources(e,t,n,r={silent:!1}){for(let r in n)(j(n[r])||Array.isArray(n[r]))&&this.addResource(e,t,r,n[r],{silent:!0});r.silent||this.emit(`added`,e,t,n)}addResourceBundle(e,t,n,r,i,a={silent:!1,skipCopy:!1}){let o=[e,t];e.includes(`.`)&&(o=e.split(`.`),r=n,n=t,t=o[1]),this.addNamespaces(t);let s=Qn(this.data,o)||{};a.skipCopy||(n=JSON.parse(JSON.stringify(n))),r?er(s,n,i):s={...s,...n},Xn(this.data,o,s),a.silent||this.emit(`added`,e,t,n)}removeResourceBundle(e,t){this.hasResourceBundle(e,t)&&delete this.data[e][t],this.removeNamespaces(t),this.emit(`removed`,e,t)}hasResourceBundle(e,t){return this.getResource(e,t)!==void 0}getResourceBundle(e,t){return t||=this.options.defaultNS,this.getResource(e,t)}getDataByLanguage(e){return this.data[e]}hasLanguageSomeTranslations(e){let t=this.getDataByLanguage(e);return!!(t&&Object.keys(t)||[]).find(e=>t[e]&&Object.keys(t[e]).length>0)}toJSON(){return this.data}},mr={processors:{},addPostProcessor(e){this.processors[e.name]=e},handle(e,t,n,r,i){return e.forEach(e=>{t=this.processors[e]?.process(t,n,r,i)??t}),t}},hr=Symbol(`i18next/PATH_KEY`);function gr(){let e=[],t=Object.create(null),n;return t.get=(r,i)=>(n?.revoke?.(),i===hr?e:(e.push(i),n=Proxy.revocable(r,t),n.proxy)),Proxy.revocable(Object.create(null),t).proxy}function _r(e,t){let{[hr]:n}=e(gr()),r=t?.keySeparator??`.`,i=t?.nsSeparator??`:`,a=t?.enableSelector===`strict`;if(n.length>1&&i){let e=t?.ns,o=a?Array.isArray(e)?e:e?[e]:null:Array.isArray(e)?e:null;if(o&&(a?o:o.length>1?o.slice(1):[]).includes(n[0]))return`${n[0]}${i}${n.slice(1).join(r)}`}return n.join(r)}var vr=e=>!j(e)&&typeof e!=`boolean`&&typeof e!=`number`,yr=class e extends fr{constructor(e,t={}){super(),Gn([`resourceStore`,`languageUtils`,`pluralResolver`,`interpolator`,`backendConnector`,`i18nFormat`,`utils`],e,this),this.options=t,this.options.keySeparator===void 0&&(this.options.keySeparator=`.`),this.logger=dr.create(`translator`),this.checkedLoadedFor={}}changeLanguage(e){e&&(this.language=e)}exists(e,t={interpolation:{}}){let n={...t};if(e==null)return!1;let r=this.resolve(e,n);if(r?.res===void 0)return!1;let i=vr(r.res);return!(n.returnObjects===!1&&i)}extractFromKey(e,t){let n=t.nsSeparator===void 0?this.options.nsSeparator:t.nsSeparator;n===void 0&&(n=`:`);let r=t.keySeparator===void 0?this.options.keySeparator:t.keySeparator,i=t.ns||this.options.defaultNS||[],a=n&&e.includes(n),o=!this.options.userDefinedKeySeparator&&!t.keySeparator&&!this.options.userDefinedNsSeparator&&!t.nsSeparator&&!sr(e,n,r);if(a&&!o){let t=e.match(this.interpolator.nestingRegexp);if(t&&t.length>0)return{key:e,namespaces:j(i)?[i]:i};let a=e.split(n);(n!==r||n===r&&this.options.ns.includes(a[0]))&&(i=a.shift()),e=a.join(r)}return{key:e,namespaces:j(i)?[i]:i}}translate(t,n,r){let i=typeof n==`object`?{...n}:n;if(typeof i!=`object`&&this.options.overloadTranslationOptionHandler&&(i=this.options.overloadTranslationOptionHandler(arguments)),typeof i==`object`&&(i={...i}),i||={},t==null)return``;typeof t==`function`&&(t=_r(t,{...this.options,...i})),Array.isArray(t)||(t=[String(t)]),t=t.map(e=>typeof e==`function`?_r(e,{...this.options,...i}):String(e));let a=i.returnDetails===void 0?this.options.returnDetails:i.returnDetails,o=i.keySeparator===void 0?this.options.keySeparator:i.keySeparator,{key:s,namespaces:c}=this.extractFromKey(t[t.length-1],i),l=c[c.length-1],u=i.nsSeparator===void 0?this.options.nsSeparator:i.nsSeparator;u===void 0&&(u=`:`);let d=i.lng||this.language,f=i.appendNamespaceToCIMode||this.options.appendNamespaceToCIMode;if(d?.toLowerCase()===`cimode`)return f?a?{res:`${l}${u}${s}`,usedKey:s,exactUsedKey:s,usedLng:d,usedNS:l,usedParams:this.getUsedParamsDetails(i)}:`${l}${u}${s}`:a?{res:s,usedKey:s,exactUsedKey:s,usedLng:d,usedNS:l,usedParams:this.getUsedParamsDetails(i)}:s;let p=this.resolve(t,i),m=p?.res,h=p?.usedKey||s,g=p?.exactUsedKey||s,_=[`[object Number]`,`[object Function]`,`[object RegExp]`],v=i.joinArrays===void 0?this.options.joinArrays:i.joinArrays,y=!this.i18nFormat||this.i18nFormat.handleAsObject,b=i.count!==void 0&&!j(i.count),x=e.hasDefaultValue(i),S=b?this.pluralResolver.getSuffix(d,i.count,i):``,C=i.ordinal&&b?this.pluralResolver.getSuffix(d,i.count,{ordinal:!1}):``,w=b&&!i.ordinal&&i.count===0,T=w&&i[`defaultValue${this.options.pluralSeparator}zero`]||i[`defaultValue${S}`]||i[`defaultValue${C}`]||i.defaultValue,E=m;y&&!m&&x&&(E=T);let ee=vr(E),D=Object.prototype.toString.apply(E);if(y&&E&&ee&&!_.includes(D)&&!(j(v)&&Array.isArray(E))){if(!i.returnObjects&&!this.options.returnObjects){this.options.returnedObjectHandler||this.logger.warn(`accessing an object - but returnObjects options is not enabled!`);let e=this.options.returnedObjectHandler?this.options.returnedObjectHandler(h,E,{...i,ns:c}):`key '${s} (${this.language})' returned an object instead of string.`;return a?(p.res=e,p.usedParams=this.getUsedParamsDetails(i),p):e}if(o){let e=Array.isArray(E),t=e?[]:{},n=e?g:h;for(let e in E)if(Object.prototype.hasOwnProperty.call(E,e)){let r=`${n}${o}${e}`;t[e]=x&&!m?this.translate(r,{...i,defaultValue:vr(T)?T[e]:void 0,joinArrays:!1,ns:c}):this.translate(r,{...i,joinArrays:!1,ns:c}),t[e]===r&&(t[e]=E[e])}m=t}}else if(y&&j(v)&&Array.isArray(m))m=m.join(v),m&&=this.extendTranslation(m,t,i,r);else{let e=!1,n=!1;!this.isValidLookup(m)&&x&&(e=!0,m=T),this.isValidLookup(m)||(n=!0,m=s);let a=(i.missingKeyNoValueFallbackToKey||this.options.missingKeyNoValueFallbackToKey)&&n?void 0:m,c=x&&T!==m&&this.options.updateMissing;if(n||e||c){if(this.logger.log(c?`updateKey`:`missingKey`,d,l,b&&!c?`${s}${this.pluralResolver.getSuffix(d,i.count,i)}`:s,c?T:m),o){let e=this.resolve(s,{...i,keySeparator:!1});e&&e.res&&this.logger.warn(`Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.`)}let e=[],t=this.languageUtils.getFallbackCodes(this.options.fallbackLng,i.lng||this.language);if(this.options.saveMissingTo===`fallback`&&t&&t[0])for(let n=0;n<t.length;n++)e.push(t[n]);else this.options.saveMissingTo===`all`?e=this.languageUtils.toResolveHierarchy(i.lng||this.language):e.push(i.lng||this.language);let n=(e,t,n)=>{let r=x&&n!==m?n:a;this.options.missingKeyHandler?this.options.missingKeyHandler(e,l,t,r,c,i):this.backendConnector?.saveMissing&&this.backendConnector.saveMissing(e,l,t,r,c,i),this.emit(`missingKey`,e,l,t,m)};this.options.saveMissing&&(this.options.saveMissingPlurals&&b?e.forEach(e=>{let t=this.pluralResolver.getSuffixes(e,i);w&&i[`defaultValue${this.options.pluralSeparator}zero`]&&!t.includes(`${this.options.pluralSeparator}zero`)&&t.push(`${this.options.pluralSeparator}zero`),t.forEach(t=>{n([e],s+t,i[`defaultValue${t}`]||T)})}):n(e,s,T))}m=this.extendTranslation(m,t,i,p,r),n&&m===s&&this.options.appendNamespaceToMissingKey&&(m=`${l}${u}${s}`),(n||e)&&this.options.parseMissingKeyHandler&&(m=this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey?`${l}${u}${s}`:s,e?m:void 0,i))}return a?(p.res=m,p.usedParams=this.getUsedParamsDetails(i),p):m}extendTranslation(e,t,n,r,i){if(this.i18nFormat?.parse)e=this.i18nFormat.parse(e,{...this.options.interpolation.defaultVariables,...n},n.lng||this.language||r.usedLng,r.usedNS,r.usedKey,{resolved:r});else if(!n.skipInterpolation){n.interpolation&&this.interpolator.init({...n,interpolation:{...this.options.interpolation,...n.interpolation}});let a=j(e)&&(n?.interpolation?.skipOnVariables===void 0?this.options.interpolation.skipOnVariables:n.interpolation.skipOnVariables),o;if(a){let t=e.match(this.interpolator.nestingRegexp);o=t&&t.length}let s=n.replace&&!j(n.replace)?n.replace:n;if(this.options.interpolation.defaultVariables&&(s={...this.options.interpolation.defaultVariables,...s}),e=this.interpolator.interpolate(e,s,n.lng||this.language||r.usedLng,n),a){let t=e.match(this.interpolator.nestingRegexp),r=t&&t.length;o<r&&(n.nest=!1)}!n.lng&&r&&r.res&&(n.lng=this.language||r.usedLng),n.nest!==!1&&(e=this.interpolator.nest(e,(...e)=>i?.[0]===e[0]&&!n.context?(this.logger.warn(`It seems you are nesting recursively key: ${e[0]} in key: ${t[0]}`),null):this.translate(...e,t),n)),n.interpolation&&this.interpolator.reset()}let a=n.postProcess||this.options.postProcess,o=j(a)?[a]:a;return e!=null&&o?.length&&n.applyPostProcessor!==!1&&(e=mr.handle(o,e,t,this.options&&this.options.postProcessPassResolved?{i18nResolved:{...r,usedParams:this.getUsedParamsDetails(n)},...n}:n,this)),e}resolve(e,t={}){let n,r,i,a,o;return j(e)&&(e=[e]),Array.isArray(e)&&(e=e.map(e=>typeof e==`function`?_r(e,{...this.options,...t}):e)),e.forEach(e=>{if(this.isValidLookup(n))return;let s=this.extractFromKey(e,t),c=s.key;r=c;let l=s.namespaces;this.options.fallbackNS&&(l=l.concat(this.options.fallbackNS));let u=t.count!==void 0&&!j(t.count),d=u&&!t.ordinal&&t.count===0,f=t.context!==void 0&&(j(t.context)||typeof t.context==`number`)&&t.context!==``,p=t.lngs?t.lngs:this.languageUtils.toResolveHierarchy(t.lng||this.language,t.fallbackLng);l.forEach(e=>{this.isValidLookup(n)||(o=e,!this.checkedLoadedFor[`${p[0]}-${e}`]&&this.utils?.hasLoadedNamespace&&!this.utils?.hasLoadedNamespace(o)&&(this.checkedLoadedFor[`${p[0]}-${e}`]=!0,this.logger.warn(`key "${r}" for languages "${p.join(`, `)}" won't get resolved as namespace "${o}" was not yet loaded`,`This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!`)),p.forEach(r=>{if(this.isValidLookup(n))return;a=r;let o=[c];if(this.i18nFormat?.addLookupKeys)this.i18nFormat.addLookupKeys(o,c,r,e,t);else{let e;u&&(e=this.pluralResolver.getSuffix(r,t.count,t));let n=`${this.options.pluralSeparator}zero`,i=`${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;if(u&&(t.ordinal&&e.startsWith(i)&&o.push(c+e.replace(i,this.options.pluralSeparator)),o.push(c+e),d&&o.push(c+n)),f){let r=`${c}${this.options.contextSeparator||`_`}${t.context}`;o.push(r),u&&(t.ordinal&&e.startsWith(i)&&o.push(r+e.replace(i,this.options.pluralSeparator)),o.push(r+e),d&&o.push(r+n))}}let s;for(;s=o.pop();)this.isValidLookup(n)||(i=s,n=this.getResource(r,e,s,t))}))})}),{res:n,usedKey:r,exactUsedKey:i,usedLng:a,usedNS:o}}isValidLookup(e){return e!==void 0&&!(!this.options.returnNull&&e===null)&&!(!this.options.returnEmptyString&&e===``)}getResource(e,t,n,r={}){return this.i18nFormat?.getResource?this.i18nFormat.getResource(e,t,n,r):this.resourceStore.getResource(e,t,n,r)}getUsedParamsDetails(e={}){let t=[`defaultValue`,`ordinal`,`context`,`replace`,`lng`,`lngs`,`fallbackLng`,`ns`,`keySeparator`,`nsSeparator`,`returnObjects`,`returnDetails`,`joinArrays`,`postProcess`,`interpolation`],n=e.replace&&!j(e.replace),r=n?e.replace:e;if(n&&e.count!==void 0&&(r={...r,count:e.count}),this.options.interpolation.defaultVariables&&(r={...this.options.interpolation.defaultVariables,...r}),!n){r={...r};for(let e of t)delete r[e]}return r}static hasDefaultValue(e){for(let t in e)if(Object.prototype.hasOwnProperty.call(e,t)&&t.startsWith(`defaultValue`)&&e[t]!==void 0)return!0;return!1}},br=class{constructor(e){this.options=e,this.supportedLngs=this.options.supportedLngs||!1,this.logger=dr.create(`languageUtils`)}getScriptPartFromCode(e){if(e=lr(e),!e||!e.includes(`-`))return null;let t=e.split(`-`);return t.length===2||(t.pop(),t[t.length-1].toLowerCase()===`x`)?null:this.formatLanguageCode(t.join(`-`))}getLanguagePartFromCode(e){if(e=lr(e),!e||!e.includes(`-`))return e;let t=e.split(`-`);return this.formatLanguageCode(t[0])}formatLanguageCode(e){if(j(e)&&e.includes(`-`)){let t;try{t=Intl.getCanonicalLocales(e)[0]}catch{}return t&&this.options.lowerCaseLng&&(t=t.toLowerCase()),t||(this.options.lowerCaseLng?e.toLowerCase():e)}return this.options.cleanCode||this.options.lowerCaseLng?e.toLowerCase():e}isSupportedCode(e){return(this.options.load===`languageOnly`||this.options.nonExplicitSupportedLngs)&&(e=this.getLanguagePartFromCode(e)),!this.supportedLngs||!this.supportedLngs.length||this.supportedLngs.includes(e)}getBestMatchFromCodes(e){if(!e)return null;let t;return e.forEach(e=>{if(t)return;let n=this.formatLanguageCode(e);(!this.options.supportedLngs||this.isSupportedCode(n))&&(t=n)}),!t&&this.options.supportedLngs&&e.forEach(e=>{if(t)return;let n=this.getScriptPartFromCode(e);if(this.isSupportedCode(n))return t=n;let r=this.getLanguagePartFromCode(e);if(this.isSupportedCode(r))return t=r;t=this.options.supportedLngs.find(e=>e===r?!0:!e.includes(`-`)&&!r.includes(`-`)?!1:!!(e.includes(`-`)&&!r.includes(`-`)&&e.slice(0,e.indexOf(`-`))===r||e.startsWith(r)&&r.length>1))}),t||=this.getFallbackCodes(this.options.fallbackLng)[0],t}getFallbackCodes(e,t){if(!e)return[];if(typeof e==`function`&&(e=e(t)),j(e)&&(e=[e]),Array.isArray(e))return e;if(!t)return e.default||[];let n=e[t];return n||=e[this.getScriptPartFromCode(t)],n||=e[this.formatLanguageCode(t)],n||=e[this.getLanguagePartFromCode(t)],n||=e.default,n||[]}toResolveHierarchy(e,t){let n=this.getFallbackCodes((t===!1?[]:t)||this.options.fallbackLng||[],e),r=[],i=e=>{e&&(this.isSupportedCode(e)?r.push(e):this.logger.warn(`rejecting language code not found in supportedLngs: ${e}`))};return j(e)&&(e.includes(`-`)||e.includes(`_`))?(this.options.load!==`languageOnly`&&i(this.formatLanguageCode(e)),this.options.load!==`languageOnly`&&this.options.load!==`currentOnly`&&i(this.getScriptPartFromCode(e)),this.options.load!==`currentOnly`&&i(this.getLanguagePartFromCode(e))):j(e)&&i(this.formatLanguageCode(e)),n.forEach(e=>{r.includes(e)||i(this.formatLanguageCode(e))}),r}},xr={zero:0,one:1,two:2,few:3,many:4,other:5},Sr={select:e=>e===1?`one`:`other`,resolvedOptions:()=>({pluralCategories:[`one`,`other`]})},Cr=class{constructor(e,t={}){this.languageUtils=e,this.options=t,this.logger=dr.create(`pluralResolver`),this.pluralRulesCache={}}clearCache(){this.pluralRulesCache={}}getRule(e,t={}){let n=lr(e===`dev`?`en`:e),r=t.ordinal?`ordinal`:`cardinal`,i=JSON.stringify({cleanedCode:n,type:r});if(i in this.pluralRulesCache)return this.pluralRulesCache[i];let a;try{a=new Intl.PluralRules(n,{type:r})}catch{if(typeof Intl>`u`)return this.logger.error(`No Intl support, please use an Intl polyfill!`),Sr;if(!e.match(/-|_/))return Sr;let n=this.languageUtils.getLanguagePartFromCode(e);a=this.getRule(n,t)}return this.pluralRulesCache[i]=a,a}needsPlural(e,t={}){let n=this.getRule(e,t);return n||=this.getRule(`dev`,t),n?.resolvedOptions().pluralCategories.length>1}getPluralFormsOfKey(e,t,n={}){return this.getSuffixes(e,n).map(e=>`${t}${e}`)}getSuffixes(e,t={}){let n=this.getRule(e,t);return n||=this.getRule(`dev`,t),n?n.resolvedOptions().pluralCategories.sort((e,t)=>xr[e]-xr[t]).map(e=>`${this.options.prepend}${t.ordinal?`ordinal${this.options.prepend}`:``}${e}`):[]}getSuffix(e,t,n={}){let r=this.getRule(e,n);return r?`${this.options.prepend}${n.ordinal?`ordinal${this.options.prepend}`:``}${r.select(t)}`:(this.logger.warn(`no plural rule found for: ${e}`),this.getSuffix(`dev`,t,n))}},wr=(e,t,n,r=`.`,i=!0)=>{let a=$n(e,t,n);return!a&&i&&j(n)&&(a=cr(e,n,r),a===void 0&&(a=cr(t,n,r))),a},Tr=e=>e.replace(/\$/g,`$$$$`),Er=class{constructor(e={}){this.logger=dr.create(`interpolator`),this.options=e,this.format=e?.interpolation?.format||(e=>e),this.init(e)}init(e={}){e.interpolation||={escapeValue:!0};let{escape:t,escapeValue:n,useRawValueToEscape:r,prefix:i,prefixEscaped:a,suffix:o,suffixEscaped:s,formatSeparator:c,unescapeSuffix:l,unescapePrefix:u,nestingPrefix:d,nestingPrefixEscaped:f,nestingSuffix:p,nestingSuffixEscaped:m,nestingOptionsSeparator:h,maxReplaces:g,alwaysFormat:_}=e.interpolation;this.escape=t===void 0?rr:t,this.escapeValue=n===void 0||n,this.useRawValueToEscape=r!==void 0&&r,this.prefix=i?tr(i):a||`{{`,this.suffix=o?tr(o):s||`}}`,this.formatSeparator=c||`,`,this.unescapePrefix=l?``:u?tr(u):`-`,this.unescapeSuffix=this.unescapePrefix?``:l?tr(l):``,this.nestingPrefix=d?tr(d):f||tr(`$t(`),this.nestingSuffix=p?tr(p):m||tr(`)`),this.nestingOptionsSeparator=h||`,`,this.maxReplaces=g||1e3,this.alwaysFormat=_!==void 0&&_,this.resetRegExp()}reset(){this.options&&this.init(this.options)}resetRegExp(){let e=(e,t)=>e?.source===t?(e.lastIndex=0,e):new RegExp(t,`g`);this.regexp=e(this.regexp,`${this.prefix}(.+?)${this.suffix}`),this.regexpUnescape=e(this.regexpUnescape,`${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`),this.nestingRegexp=e(this.nestingRegexp,`${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`)}interpolate(e,t,n,r){let i,a,o,s=this.options&&this.options.interpolation&&this.options.interpolation.defaultVariables||{},c=e=>{if(!e.includes(this.formatSeparator)){let i=wr(t,s,e,this.options.keySeparator,this.options.ignoreJSONStructure);return this.alwaysFormat?this.format(i,void 0,n,{...r,...t,interpolationkey:e}):i}let i=e.split(this.formatSeparator),a=i.shift().trim(),o=i.join(this.formatSeparator).trim();return this.format(wr(t,s,a,this.options.keySeparator,this.options.ignoreJSONStructure),o,n,{...r,...t,interpolationkey:a})};this.resetRegExp(),!this.escapeValue&&typeof e==`string`&&/\$t\([^)]*\{[^}]*\{\{/.test(e)&&this.logger.warn(`nesting options string contains interpolated variables with escapeValue: false — if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.`);let l=r?.missingInterpolationHandler||this.options.missingInterpolationHandler,u=r?.interpolation?.skipOnVariables===void 0?this.options.interpolation.skipOnVariables:r.interpolation.skipOnVariables;return[{regex:this.regexpUnescape,safeValue:e=>e},{regex:this.regexp,safeValue:e=>this.escapeValue?this.escape(e):e}].forEach(t=>{for(o=0;i=t.regex.exec(e);){let n=i[1].trim();if(a=c(n),a===void 0){if(typeof l==`function`){let t=l(e,i,r);a=j(t)?t:``}else if(r&&Object.prototype.hasOwnProperty.call(r,n))a=``;else if(u){a=i[0];continue}else this.logger.warn(`missed to pass in variable ${n} for interpolating ${e}`),a=``}else!j(a)&&!this.useRawValueToEscape&&(a=Wn(a));let s=t.safeValue(a);if(e=e.replace(i[0],Tr(s)),u?(t.regex.lastIndex+=s.length,t.regex.lastIndex-=i[0].length):t.regex.lastIndex=0,o++,o>=this.maxReplaces)break}}),e}nest(e,t,n={}){let r,i,a,o=(e,t)=>{let n=this.nestingOptionsSeparator;if(!e.includes(n))return e;let r=e.split(RegExp(`${tr(n)}[ ]*{`)),i=`{${r[1]}`;e=r[0],i=this.interpolate(i,a);let o=i.match(/'/g),s=i.match(/"/g);((o?.length??0)%2==0&&!s||(s?.length??0)%2!=0)&&(i=i.replace(/'/g,`"`));try{a=JSON.parse(i),t&&(a={...t,...a})}catch(t){return this.logger.warn(`failed parsing options string in nesting for key ${e}`,t),`${e}${n}${i}`}return a.defaultValue&&a.defaultValue.includes(this.prefix)&&delete a.defaultValue,e};for(;r=this.nestingRegexp.exec(e);){let s=[];a={...n},a=a.replace&&!j(a.replace)?a.replace:a,a.applyPostProcessor=!1,delete a.defaultValue;let c=/{.*}/s.test(r[1])?r[1].lastIndexOf(`}`)+1:r[1].indexOf(this.formatSeparator);if(c!==-1&&(s=r[1].slice(c).split(this.formatSeparator).map(e=>e.trim()).filter(Boolean),r[1]=r[1].slice(0,c)),i=t(o.call(this,r[1].trim(),a),a),i&&r[0]===e&&!j(i))return i;j(i)||(i=Wn(i)),i||=(this.logger.warn(`missed to resolve ${r[1]} for nesting ${e}`),``),s.length&&(i=s.reduce((e,t)=>this.format(e,t,n.lng,{...n,interpolationkey:r[1].trim()}),i.trim())),e=e.replace(r[0],i),this.regexp.lastIndex=0}return e}},Dr=e=>{let t=e.toLowerCase().trim(),n={};if(e.includes(`(`)){let r=e.split(`(`);t=r[0].toLowerCase().trim();let i=r[1].slice(0,-1);t===`currency`&&!i.includes(`:`)?n.currency||=i.trim():t===`relativetime`&&!i.includes(`:`)?n.range||=i.trim():i.split(`;`).forEach(e=>{if(e){let[t,...r]=e.split(`:`),i=r.join(`:`).trim().replace(/^'+|'+$/g,``),a=t.trim();n[a]||(n[a]=i),i===`false`&&(n[a]=!1),i===`true`&&(n[a]=!0),isNaN(i)||(n[a]=parseInt(i,10))}})}return{formatName:t,formatOptions:n}},Or=e=>{let t={};return(n,r,i)=>{let a=i;i&&i.interpolationkey&&i.formatParams&&i.formatParams[i.interpolationkey]&&i[i.interpolationkey]&&(a={...a,[i.interpolationkey]:void 0});let o=r+JSON.stringify(a),s=t[o];return s||(s=e(lr(r),i),t[o]=s),s(n)}},kr=e=>(t,n,r)=>e(lr(n),r)(t),Ar=class{constructor(e={}){this.logger=dr.create(`formatter`),this.options=e,this.init(e)}init(e,t={interpolation:{}}){this.formatSeparator=t.interpolation.formatSeparator||`,`;let n=t.cacheInBuiltFormats?Or:kr;this.formats={number:n((e,t)=>{let n=new Intl.NumberFormat(e,{...t});return e=>n.format(e)}),currency:n((e,t)=>{let n=new Intl.NumberFormat(e,{...t,style:`currency`});return e=>n.format(e)}),datetime:n((e,t)=>{let n=new Intl.DateTimeFormat(e,{...t});return e=>n.format(e)}),relativetime:n((e,t)=>{let n=new Intl.RelativeTimeFormat(e,{...t});return e=>n.format(e,t.range||`day`)}),list:n((e,t)=>{let n=new Intl.ListFormat(e,{...t});return e=>n.format(e)})}}add(e,t){this.formats[e.toLowerCase().trim()]=t}addCached(e,t){this.formats[e.toLowerCase().trim()]=Or(t)}format(e,t,n,r={}){if(!t||e==null)return e;let i=t.split(this.formatSeparator),a=[];for(let e=0;e<i.length;e++){let t=i[e];for(;t.indexOf(`(`)>-1&&!t.includes(`)`)&&e+1<i.length;)t=`${t}${this.formatSeparator}${i[++e]}`;a.push(t)}return a.reduce((e,t)=>{let{formatName:i,formatOptions:a}=Dr(t);if(this.formats[i]){let t=e;try{let o=r?.formatParams?.[r.interpolationkey]||{},s=o.locale||o.lng||r.locale||r.lng||n;t=this.formats[i](e,s,{...a,...r,...o})}catch(e){this.logger.warn(e)}return t}return this.logger.warn(`there was no format function for ${i}`),e},e)}},jr=(e,t)=>{e.pending[t]!==void 0&&(delete e.pending[t],e.pendingCount--)},Mr=class extends fr{constructor(e,t,n,r={}){super(),this.backend=e,this.store=t,this.services=n,this.languageUtils=n.languageUtils,this.options=r,this.logger=dr.create(`backendConnector`),this.waitingReads=[],this.maxParallelReads=r.maxParallelReads||10,this.readingCalls=0,this.maxRetries=r.maxRetries>=0?r.maxRetries:5,this.retryTimeout=r.retryTimeout>=1?r.retryTimeout:350,this.state={},this.queue=[],this.backend?.init?.(n,r.backend,r)}queueLoad(e,t,n,r){let i={},a={},o={},s={};return e.forEach(e=>{let r=!0;t.forEach(t=>{let o=`${e}|${t}`;!n.reload&&this.store.hasResourceBundle(e,t)?this.state[o]=2:this.state[o]<0||(this.state[o]===1?a[o]===void 0&&(a[o]=!0):(this.state[o]=1,r=!1,a[o]===void 0&&(a[o]=!0),i[o]===void 0&&(i[o]=!0),s[t]===void 0&&(s[t]=!0)))}),r||(o[e]=!0)}),(Object.keys(i).length||Object.keys(a).length)&&this.queue.push({pending:a,pendingCount:Object.keys(a).length,loaded:{},errors:[],callback:r}),{toLoad:Object.keys(i),pending:Object.keys(a),toLoadLanguages:Object.keys(o),toLoadNamespaces:Object.keys(s)}}loaded(e,t,n){let r=e.split(`|`),i=r[0],a=r[1];t&&this.emit(`failedLoading`,i,a,t),!t&&n&&this.store.addResourceBundle(i,a,n,void 0,void 0,{skipCopy:!0}),this.state[e]=t?-1:2,t&&n&&(this.state[e]=0);let o={};this.queue.forEach(n=>{Zn(n.loaded,[i],a),jr(n,e),t&&n.errors.push(t),n.pendingCount===0&&!n.done&&(Object.keys(n.loaded).forEach(e=>{o[e]||(o[e]={});let t=n.loaded[e];t.length&&t.forEach(t=>{o[e][t]===void 0&&(o[e][t]=!0)})}),n.done=!0,n.errors.length?n.callback(n.errors):n.callback())}),this.emit(`loaded`,o),this.queue=this.queue.filter(e=>!e.done)}read(e,t,n,r=0,i=this.retryTimeout,a){if(!e.length)return a(null,{});if(this.readingCalls>=this.maxParallelReads){this.waitingReads.push({lng:e,ns:t,fcName:n,tried:r,wait:i,callback:a});return}this.readingCalls++;let o=(o,s)=>{if(this.readingCalls--,this.waitingReads.length>0){let e=this.waitingReads.shift();this.read(e.lng,e.ns,e.fcName,e.tried,e.wait,e.callback)}if(o&&s&&r<this.maxRetries){setTimeout(()=>{this.read(e,t,n,r+1,i*2,a)},i);return}a(o,s)},s=this.backend[n].bind(this.backend);if(s.length===2){try{let n=s(e,t);n&&typeof n.then==`function`?n.then(e=>o(null,e)).catch(o):o(null,n)}catch(e){o(e)}return}return s(e,t,o)}prepareLoading(e,t,n={},r){if(!this.backend)return this.logger.warn(`No backend was added via i18next.use. Will not load resources.`),r&&r();j(e)&&(e=this.languageUtils.toResolveHierarchy(e)),j(t)&&(t=[t]);let i=this.queueLoad(e,t,n,r);if(!i.toLoad.length)return i.pending.length||r(),null;i.toLoad.forEach(e=>{this.loadOne(e)})}load(e,t,n){this.prepareLoading(e,t,{},n)}reload(e,t,n){this.prepareLoading(e,t,{reload:!0},n)}loadOne(e,t=``){let n=e.split(`|`),r=n[0],i=n[1];this.read(r,i,`read`,void 0,void 0,(n,a)=>{n&&this.logger.warn(`${t}loading namespace ${i} for language ${r} failed`,n),!n&&a&&this.logger.log(`${t}loaded namespace ${i} for language ${r}`,a),this.loaded(e,n,a)})}saveMissing(e,t,n,r,i,a={},o=()=>{}){if(this.services?.utils?.hasLoadedNamespace&&!this.services?.utils?.hasLoadedNamespace(t)){this.logger.warn(`did not save key "${n}" as the namespace "${t}" was not yet loaded`,`This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!`);return}if(n!=null&&n!==``){if(this.backend?.create){let s={...a,isUpdate:i},c=this.backend.create.bind(this.backend);if(c.length<6)try{let i;i=c.length===5?c(e,t,n,r,s):c(e,t,n,r),i&&typeof i.then==`function`?i.then(e=>o(null,e)).catch(o):o(null,i)}catch(e){o(e)}else c(e,t,n,r,o,s)}!e||!e[0]||this.store.addResource(e[0],t,n,r)}}},Nr=()=>({debug:!1,initAsync:!0,ns:[`translation`],defaultNS:[`translation`],fallbackLng:[`dev`],fallbackNS:!1,supportedLngs:!1,nonExplicitSupportedLngs:!1,load:`all`,preload:!1,keySeparator:`.`,nsSeparator:`:`,pluralSeparator:`_`,contextSeparator:`_`,enableSelector:!1,partialBundledLanguages:!1,saveMissing:!1,updateMissing:!1,saveMissingTo:`fallback`,saveMissingPlurals:!0,missingKeyHandler:!1,missingInterpolationHandler:!1,postProcess:!1,postProcessPassResolved:!1,returnNull:!1,returnEmptyString:!0,returnObjects:!1,joinArrays:!1,returnedObjectHandler:!1,parseMissingKeyHandler:!1,appendNamespaceToMissingKey:!1,appendNamespaceToCIMode:!1,overloadTranslationOptionHandler:e=>{let t={};if(typeof e[1]==`object`&&(t=e[1]),j(e[1])&&(t.defaultValue=e[1]),j(e[2])&&(t.tDescription=e[2]),typeof e[2]==`object`||typeof e[3]==`object`){let n=e[3]||e[2];Object.keys(n).forEach(e=>{t[e]=n[e]})}return t},interpolation:{escapeValue:!0,prefix:`{{`,suffix:`}}`,formatSeparator:`,`,unescapePrefix:`-`,nestingPrefix:`$t(`,nestingSuffix:`)`,nestingOptionsSeparator:`,`,maxReplaces:1e3,skipOnVariables:!0},cacheInBuiltFormats:!0}),Pr=e=>(j(e.ns)&&(e.ns=[e.ns]),j(e.fallbackLng)&&(e.fallbackLng=[e.fallbackLng]),j(e.fallbackNS)&&(e.fallbackNS=[e.fallbackNS]),e.supportedLngs&&!e.supportedLngs.includes(`cimode`)&&(e.supportedLngs=e.supportedLngs.concat([`cimode`])),e),Fr=()=>{},Ir=e=>{Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach(t=>{typeof e[t]==`function`&&(e[t]=e[t].bind(e))})},Lr=class e extends fr{constructor(e={},t){if(super(),this.options=Pr(e),this.services={},this.logger=dr,this.modules={external:[]},Ir(this),t&&!this.isInitialized&&!e.isClone){if(!this.options.initAsync)return this.init(e,t),this;setTimeout(()=>{this.init(e,t)},0)}}init(e={},t){this.isInitializing=!0,typeof e==`function`&&(t=e,e={}),e.defaultNS==null&&e.ns&&(j(e.ns)?e.defaultNS=e.ns:e.ns.includes(`translation`)||(e.defaultNS=e.ns[0]));let n=Nr();this.options={...n,...this.options,...Pr(e)},this.options.interpolation={...n.interpolation,...this.options.interpolation},e.keySeparator!==void 0&&(this.options.userDefinedKeySeparator=e.keySeparator),e.nsSeparator!==void 0&&(this.options.userDefinedNsSeparator=e.nsSeparator),typeof this.options.overloadTranslationOptionHandler!=`function`&&(this.options.overloadTranslationOptionHandler=n.overloadTranslationOptionHandler);let r=e=>e?typeof e==`function`?new e:e:null;if(!this.options.isClone){this.modules.logger?dr.init(r(this.modules.logger),this.options):dr.init(null,this.options);let e;e=this.modules.formatter?this.modules.formatter:Ar;let t=new br(this.options);this.store=new pr(this.options.resources,this.options);let n=this.services;n.logger=dr,n.resourceStore=this.store,n.languageUtils=t,n.pluralResolver=new Cr(t,{prepend:this.options.pluralSeparator}),e&&(n.formatter=r(e),n.formatter.init&&n.formatter.init(n,this.options),this.options.interpolation.format=n.formatter.format.bind(n.formatter)),n.interpolator=new Er(this.options),n.utils={hasLoadedNamespace:this.hasLoadedNamespace.bind(this)},n.backendConnector=new Mr(r(this.modules.backend),n.resourceStore,n,this.options),n.backendConnector.on(`*`,(e,...t)=>{this.emit(e,...t)}),this.modules.languageDetector&&(n.languageDetector=r(this.modules.languageDetector),n.languageDetector.init&&n.languageDetector.init(n,this.options.detection,this.options)),this.modules.i18nFormat&&(n.i18nFormat=r(this.modules.i18nFormat),n.i18nFormat.init&&n.i18nFormat.init(this)),this.translator=new yr(this.services,this.options),this.translator.on(`*`,(e,...t)=>{this.emit(e,...t)}),this.modules.external.forEach(e=>{e.init&&e.init(this)})}if(this.format=this.options.interpolation.format,t||=Fr,this.options.fallbackLng&&!this.services.languageDetector&&!this.options.lng){let e=this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);e.length>0&&e[0]!==`dev`&&(this.options.lng=e[0])}!this.services.languageDetector&&!this.options.lng&&this.logger.warn(`init: no languageDetector is used and no lng is defined`),[`getResource`,`hasResourceBundle`,`getResourceBundle`,`getDataByLanguage`].forEach(e=>{this[e]=(...t)=>this.store[e](...t)}),[`addResource`,`addResources`,`addResourceBundle`,`removeResourceBundle`].forEach(e=>{this[e]=(...t)=>(this.store[e](...t),this)});let i=Un(),a=()=>{let e=(e,n)=>{this.isInitializing=!1,this.isInitialized&&!this.initializedStoreOnce&&this.logger.warn(`init: i18next is already initialized. You should call init just once!`),this.isInitialized=!0,this.options.isClone||this.logger.log(`initialized`,this.options),this.emit(`initialized`,this.options),i.resolve(n),t(e,n)};if((this.languages||this.isLanguageChangingTo)&&!this.isInitialized)return e(null,this.t.bind(this));this.changeLanguage(this.options.lng,e)};return this.options.resources||!this.options.initAsync?a():setTimeout(a,0),i}loadResources(e,t=Fr){let n=t,r=j(e)?e:this.language;if(typeof e==`function`&&(n=e),!this.options.resources||this.options.partialBundledLanguages){if(r?.toLowerCase()===`cimode`&&(!this.options.preload||this.options.preload.length===0))return n();let e=[],t=t=>{t&&t!==`cimode`&&this.services.languageUtils.toResolveHierarchy(t).forEach(t=>{t!==`cimode`&&(e.includes(t)||e.push(t))})};r?t(r):this.services.languageUtils.getFallbackCodes(this.options.fallbackLng).forEach(e=>t(e)),this.options.preload?.forEach?.(e=>t(e)),this.services.backendConnector.load(e,this.options.ns,e=>{!e&&!this.resolvedLanguage&&this.language&&this.setResolvedLanguage(this.language),n(e)})}else n(null)}reloadResources(e,t,n){let r=Un();return typeof e==`function`&&(n=e,e=void 0),typeof t==`function`&&(n=t,t=void 0),e||=this.languages,t||=this.options.ns,n||=Fr,this.services.backendConnector.reload(e,t,e=>{r.resolve(),n(e)}),r}use(e){if(!e)throw Error(`You are passing an undefined module! Please check the object you are passing to i18next.use()`);if(!e.type)throw Error(`You are passing a wrong module! Please check the object you are passing to i18next.use()`);return e.type===`backend`&&(this.modules.backend=e),(e.type===`logger`||e.log&&e.warn&&e.error)&&(this.modules.logger=e),e.type===`languageDetector`&&(this.modules.languageDetector=e),e.type===`i18nFormat`&&(this.modules.i18nFormat=e),e.type===`postProcessor`&&mr.addPostProcessor(e),e.type===`formatter`&&(this.modules.formatter=e),e.type===`3rdParty`&&this.modules.external.push(e),this}setResolvedLanguage(e){if(!(!e||!this.languages)&&![`cimode`,`dev`].includes(e)){for(let e=0;e<this.languages.length;e++){let t=this.languages[e];if(![`cimode`,`dev`].includes(t)&&this.store.hasLanguageSomeTranslations(t)){this.resolvedLanguage=t;break}}!this.resolvedLanguage&&!this.languages.includes(e)&&this.store.hasLanguageSomeTranslations(e)&&(this.resolvedLanguage=e,this.languages.unshift(e))}}changeLanguage(e,t){this.isLanguageChangingTo=e;let n=Un();this.emit(`languageChanging`,e);let r=e=>{this.language=e,this.languages=this.services.languageUtils.toResolveHierarchy(e),this.resolvedLanguage=void 0,this.setResolvedLanguage(e)},i=(i,a)=>{a?this.isLanguageChangingTo===e&&(r(a),this.translator.changeLanguage(a),this.isLanguageChangingTo=void 0,this.emit(`languageChanged`,a),this.logger.log(`languageChanged`,a)):this.isLanguageChangingTo=void 0,n.resolve((...e)=>this.t(...e)),t&&t(i,(...e)=>this.t(...e))},a=t=>{!e&&!t&&this.services.languageDetector&&(t=[]);let n=j(t)?t:t&&t[0],a=this.store.hasLanguageSomeTranslations(n)?n:this.services.languageUtils.getBestMatchFromCodes(j(t)?[t]:t);a&&(this.language||r(a),this.translator.language||this.translator.changeLanguage(a),this.services.languageDetector?.cacheUserLanguage?.(a)),this.loadResources(a,e=>{i(e,a)})};return!e&&this.services.languageDetector&&!this.services.languageDetector.async?a(this.services.languageDetector.detect()):!e&&this.services.languageDetector&&this.services.languageDetector.async?this.services.languageDetector.detect.length===0?this.services.languageDetector.detect().then(a):this.services.languageDetector.detect(a):a(e),n}getFixedT(e,t,n,r){let i=r?.scopeNs,a=(e,t,...r)=>{let o;o=typeof t==`object`?{...t}:this.options.overloadTranslationOptionHandler([e,t].concat(r)),o.lng=o.lng||a.lng,o.lngs=o.lngs||a.lngs;let s=o.ns!==void 0&&o.ns!==null;o.ns=o.ns||a.ns,o.keyPrefix!==``&&(o.keyPrefix=o.keyPrefix||n||a.keyPrefix);let c={...this.options,...o};Array.isArray(i)&&!s&&(c.ns=i),typeof o.keyPrefix==`function`&&(o.keyPrefix=_r(o.keyPrefix,c));let l=this.options.keySeparator||`.`,u;return o.keyPrefix&&Array.isArray(e)?u=e.map(e=>(typeof e==`function`&&(e=_r(e,c)),`${o.keyPrefix}${l}${e}`)):(typeof e==`function`&&(e=_r(e,c)),u=o.keyPrefix?`${o.keyPrefix}${l}${e}`:e),this.t(u,o)};return j(e)?a.lng=e:a.lngs=e,a.ns=t,a.keyPrefix=n,a}t(...e){return this.translator?.translate(...e)}exists(...e){return this.translator?.exists(...e)}setDefaultNamespace(e){this.options.defaultNS=e}hasLoadedNamespace(e,t={}){if(!this.isInitialized)return this.logger.warn(`hasLoadedNamespace: i18next was not initialized`,this.languages),!1;if(!this.languages||!this.languages.length)return this.logger.warn(`hasLoadedNamespace: i18n.languages were undefined or empty`,this.languages),!1;let n=t.lng||this.resolvedLanguage||this.languages[0],r=this.options?this.options.fallbackLng:!1,i=this.languages[this.languages.length-1];if(n.toLowerCase()===`cimode`)return!0;let a=(e,t)=>{let n=this.services.backendConnector.state[`${e}|${t}`];return n===-1||n===0||n===2};if(t.precheck){let e=t.precheck(this,a);if(e!==void 0)return e}return!!(this.hasResourceBundle(n,e)||!this.services.backendConnector.backend||this.options.resources&&!this.options.partialBundledLanguages||a(n,e)&&(!r||a(i,e)))}loadNamespaces(e,t){let n=Un();return this.options.ns?(j(e)&&(e=[e]),e.forEach(e=>{this.options.ns.includes(e)||this.options.ns.push(e)}),this.loadResources(e=>{n.resolve(),t&&t(e)}),n):(t&&t(),Promise.resolve())}loadLanguages(e,t){let n=Un();j(e)&&(e=[e]);let r=this.options.preload||[],i=e.filter(e=>!r.includes(e)&&this.services.languageUtils.isSupportedCode(e));return i.length?(this.options.preload=r.concat(i),this.loadResources(e=>{n.resolve(),t&&t(e)}),n):(t&&t(),Promise.resolve())}dir(e){if(e||=this.resolvedLanguage||(this.languages?.length>0?this.languages[0]:this.language),!e)return`rtl`;try{let t=new Intl.Locale(e);if(t&&t.getTextInfo){let e=t.getTextInfo();if(e&&e.direction)return e.direction}}catch{}let t=`ar.shu.sqr.ssh.xaa.yhd.yud.aao.abh.abv.acm.acq.acw.acx.acy.adf.ads.aeb.aec.afb.ajp.apc.apd.arb.arq.ars.ary.arz.auz.avl.ayh.ayl.ayn.ayp.bbz.pga.he.iw.ps.pbt.pbu.pst.prp.prd.ug.ur.ydd.yds.yih.ji.yi.hbo.men.xmn.fa.jpr.peo.pes.prs.dv.sam.ckb`.split(`.`),n=this.services?.languageUtils||new br(Nr());return e.toLowerCase().indexOf(`-latn`)>1?`ltr`:t.includes(n.getLanguagePartFromCode(e))||e.toLowerCase().indexOf(`-arab`)>1?`rtl`:`ltr`}static createInstance(t={},n){let r=new e(t,n);return r.createInstance=e.createInstance,r}cloneInstance(t={},n=Fr){let r=t.forkResourceStore;r&&delete t.forkResourceStore;let i={...this.options,...t,isClone:!0},a=new e(i);if((t.debug!==void 0||t.prefix!==void 0)&&(a.logger=a.logger.clone(t)),[`store`,`services`,`language`].forEach(e=>{a[e]=this[e]}),a.services={...this.services},a.services.utils={hasLoadedNamespace:a.hasLoadedNamespace.bind(a)},r&&(a.store=new pr(Object.keys(this.store.data).reduce((e,t)=>(e[t]={...this.store.data[t]},e[t]=Object.keys(e[t]).reduce((n,r)=>(n[r]={...e[t][r]},n),e[t]),e),{}),i),a.services.resourceStore=a.store),t.interpolation){let e={...Nr().interpolation,...this.options.interpolation,...t.interpolation},n={...i,interpolation:e};a.services.interpolator=new Er(n)}return a.translator=new yr(a.services,i),a.translator.on(`*`,(e,...t)=>{a.emit(e,...t)}),a.init(i,n),a.translator.options=i,a.translator.backendConnector.services.utils={hasLoadedNamespace:a.hasLoadedNamespace.bind(a)},a}toJSON(){return{options:this.options,store:this.store,language:this.language,languages:this.languages,resolvedLanguage:this.resolvedLanguage}}}.createInstance();Lr.createInstance,Lr.dir,Lr.init,Lr.loadResources,Lr.reloadResources,Lr.use,Lr.changeLanguage,Lr.getFixedT,Lr.t,Lr.exists,Lr.setDefaultNamespace,Lr.hasLoadedNamespace,Lr.loadNamespaces,Lr.loadLanguages;var Rr=(e,t,n,r)=>{let i=[n,{code:t,...r||{}}];if(e?.services?.logger?.forward)return e.services.logger.forward(i,`warn`,`react-i18next::`,!0);Gr(i[0])&&(i[0]=`react-i18next:: ${i[0]}`),e?.services?.logger?.warn?e.services.logger.warn(...i):console?.warn&&console.warn(...i)},zr={},Br=(e,t,n,r)=>{Gr(n)&&zr[n]||(Gr(n)&&(zr[n]=new Date),Rr(e,t,n,r))},Vr=(e,t)=>()=>{if(e.isInitialized)t();else{let n=()=>{setTimeout(()=>{e.off(`initialized`,n)},0),t()};e.on(`initialized`,n)}},Hr=(e,t,n)=>{e.loadNamespaces(t,Vr(e,n))},Ur=(e,t,n,r)=>{if(Gr(n)&&(n=[n]),e.options.preload&&e.options.preload.indexOf(t)>-1)return Hr(e,n,r);n.forEach(t=>{e.options.ns.indexOf(t)<0&&e.options.ns.push(t)}),e.loadLanguages(t,Vr(e,r))},Wr=(e,t,n={})=>!t.languages||!t.languages.length?(Br(t,`NO_LANGUAGES`,`i18n.languages were undefined or empty`,{languages:t.languages}),!0):t.hasLoadedNamespace(e,{lng:n.lng,precheck:(t,r)=>{if(n.bindI18n&&n.bindI18n.indexOf(`languageChanging`)>-1&&t.services.backendConnector.backend&&t.isLanguageChangingTo&&!r(t.isLanguageChangingTo,e))return!1}}),Gr=e=>typeof e==`string`,Kr=e=>typeof e==`object`&&!!e,qr=/&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g,Jr={"&amp;":`&`,"&#38;":`&`,"&lt;":`<`,"&#60;":`<`,"&gt;":`>`,"&#62;":`>`,"&apos;":`'`,"&#39;":`'`,"&quot;":`"`,"&#34;":`"`,"&nbsp;":` `,"&#160;":` `,"&copy;":`©`,"&#169;":`©`,"&reg;":`®`,"&#174;":`®`,"&hellip;":`…`,"&#8230;":`…`,"&#x2F;":`/`,"&#47;":`/`},Yr=e=>Jr[e],Xr={bindI18n:`languageChanged`,bindI18nStore:``,transEmptyNodeValue:``,transSupportBasicHtmlNodes:!0,transWrapTextNodes:``,transKeepBasicHtmlNodesFor:[`br`,`strong`,`i`,`p`],useSuspense:!0,unescape:e=>e.replace(qr,Yr),transDefaultProps:void 0},Zr=(e={})=>{Xr={...Xr,...e}},Qr=()=>Xr,$r,ei=e=>{$r=e},ti=()=>$r,ni={type:`3rdParty`,init(e){Zr(e.options.react),ei(e)}},ri=(0,S.createContext)(),ii=class{constructor(){this.usedNamespaces={}}addUsedNamespaces(e){e.forEach(e=>{this.usedNamespaces[e]||(this.usedNamespaces[e]=!0)})}getUsedNamespaces(){return Object.keys(this.usedNamespaces)}},ai=o((e=>{var t=d();function n(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var r=typeof Object.is==`function`?Object.is:n,i=t.useState,a=t.useEffect,o=t.useLayoutEffect,s=t.useDebugValue;function c(e,t){var n=t(),r=i({inst:{value:n,getSnapshot:t}}),c=r[0].inst,u=r[1];return o(function(){c.value=n,c.getSnapshot=t,l(c)&&u({inst:c})},[e,n,t]),a(function(){return l(c)&&u({inst:c}),e(function(){l(c)&&u({inst:c})})},[e]),s(n),n}function l(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!r(e,n)}catch{return!0}}function u(e,t){return t()}var f=typeof window>`u`||window.document===void 0||window.document.createElement===void 0?u:c;e.useSyncExternalStore=t.useSyncExternalStore===void 0?f:t.useSyncExternalStore})),oi=o(((e,t)=>{t.exports=ai()}))(),si={t:(e,t)=>{if(Gr(t))return t;if(Kr(t)&&Gr(t.defaultValue))return t.defaultValue;if(typeof e==`function`)return``;if(Array.isArray(e)){let t=e[e.length-1];return typeof t==`function`?``:t}return e},ready:!1},ci=()=>()=>{},li=(e,t={})=>{let{i18n:n}=t,{i18n:r,defaultNS:i}=(0,S.useContext)(ri)||{},a=n||r||ti();a&&!a.reportNamespaces&&(a.reportNamespaces=new ii),a||Br(a,`NO_I18NEXT_INSTANCE`,`useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.`);let o=(0,S.useMemo)(()=>({...Qr(),...a?.options?.react,...t}),[a,t]),{useSuspense:s,keyPrefix:c}=o,l=e||i||a?.options?.defaultNS,u=Gr(l)?[l]:l||[`translation`],d=(0,S.useMemo)(()=>u,u);a?.reportNamespaces?.addUsedNamespaces?.(d);let f=(0,S.useRef)(0),p=(0,S.useCallback)(e=>{if(!a)return ci;let{bindI18n:t,bindI18nStore:n}=o,r=()=>{f.current+=1,e()};return t&&a.on(t,r),n&&a.store.on(n,r),()=>{t&&t.split(` `).forEach(e=>a.off(e,r)),n&&n.split(` `).forEach(e=>a.store.off(e,r))}},[a,o]),m=(0,S.useRef)(),h=(0,S.useCallback)(()=>{if(!a)return si;let e=!!(a.isInitialized||a.initializedStoreOnce)&&d.every(e=>Wr(e,a,o)),n=t.lng||a.language,r=f.current,i=m.current;if(i&&i.ready===e&&i.lng===n&&i.keyPrefix===c&&i.revision===r)return i;let s={t:a.getFixedT(n,o.nsMode===`fallback`?d:d[0],c,{scopeNs:d}),ready:e,lng:n,keyPrefix:c,revision:r};return m.current=s,s},[a,d,c,o,t.lng]),[g,_]=(0,S.useState)(0),{t:v,ready:y}=(0,oi.useSyncExternalStore)(p,h,h);(0,S.useEffect)(()=>{if(a&&!y&&!s){let e=()=>_(e=>e+1);t.lng?Ur(a,t.lng,d,e):Hr(a,d,e)}},[a,t.lng,d,y,s,g]);let b=a||{},x=(0,S.useRef)(null),C=(0,S.useRef)(),w=e=>{let t=Object.getOwnPropertyDescriptors(e);t.__original&&delete t.__original;let n=Object.create(Object.getPrototypeOf(e),t);if(!Object.prototype.hasOwnProperty.call(n,`__original`))try{Object.defineProperty(n,"__original",{value:e,writable:!1,enumerable:!1,configurable:!1})}catch{}return n},T=(0,S.useMemo)(()=>{let e=b,t=e?.language,n=e;e&&(x.current&&x.current.__original===e&&C.current===t?n=x.current:(n=w(e),x.current=n,C.current=t));let r=!y&&!s?(...e)=>(Br(a,`USE_T_BEFORE_READY`,`useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t.`),v(...e)):v,i=[r,n,y];return i.t=r,i.i18n=n,i.ready=y,i},[v,b,y,b.resolvedLanguage,b.language,b.languages]);if(a&&s&&!y){let e=!1;try{e=!1}catch{}throw e&&Br(a,`SUSPENDED_WHILE_LOADING`,`useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook`),new Promise(e=>{let n=()=>e();t.lng?Ur(a,t.lng,d,n):Hr(a,d,n)})}return T},{slice:ui,forEach:di}=[];function fi(e){return di.call(ui.call(arguments,1),t=>{if(t)for(let n in t)e[n]===void 0&&(e[n]=t[n])}),e}function pi(e){return typeof e==`string`&&[/<\s*script.*?>/i,/<\s*\/\s*script\s*>/i,/<\s*img.*?on\w+\s*=/i,/<\s*\w+\s*on\w+\s*=.*?>/i,/javascript\s*:/i,/vbscript\s*:/i,/expression\s*\(/i,/eval\s*\(/i,/alert\s*\(/i,/document\.cookie/i,/document\.write\s*\(/i,/window\.location/i,/innerHTML/i].some(t=>t.test(e))}var mi=/^[\u0009\u0020-\u007e\u0080-\u00ff]+$/,hi=function(e,t){let n=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{path:`/`},r=`${e}=${encodeURIComponent(t)}`;if(n.maxAge>0){let e=n.maxAge-0;if(Number.isNaN(e))throw Error(`maxAge should be a Number`);r+=`; Max-Age=${Math.floor(e)}`}if(n.domain){if(!mi.test(n.domain))throw TypeError(`option domain is invalid`);r+=`; Domain=${n.domain}`}if(n.path){if(!mi.test(n.path))throw TypeError(`option path is invalid`);r+=`; Path=${n.path}`}if(n.expires){if(typeof n.expires.toUTCString!=`function`)throw TypeError(`option expires is invalid`);r+=`; Expires=${n.expires.toUTCString()}`}if(n.httpOnly&&(r+=`; HttpOnly`),n.secure&&(r+=`; Secure`),n.sameSite)switch(typeof n.sameSite==`string`?n.sameSite.toLowerCase():n.sameSite){case!0:r+=`; SameSite=Strict`;break;case`lax`:r+=`; SameSite=Lax`;break;case`strict`:r+=`; SameSite=Strict`;break;case`none`:r+=`; SameSite=None`;break;default:throw TypeError(`option sameSite is invalid`)}return n.partitioned&&(r+=`; Partitioned`),r},gi={create(e,t,n,r){let i=arguments.length>4&&arguments[4]!==void 0?arguments[4]:{path:`/`,sameSite:`strict`};n&&(i.expires=new Date,i.expires.setTime(i.expires.getTime()+n*60*1e3)),r&&(i.domain=r),document.cookie=hi(e,t,i)},read(e){let t=`${e}=`,n=document.cookie.split(`;`);for(let e=0;e<n.length;e++){let r=n[e];for(;r.charAt(0)===` `;)r=r.substring(1,r.length);if(r.indexOf(t)===0)return r.substring(t.length,r.length)}return null},remove(e,t){this.create(e,``,-1,t)}},_i={name:`cookie`,lookup(e){let{lookupCookie:t}=e;if(t&&typeof document<`u`)return gi.read(t)||void 0},cacheUserLanguage(e,t){let{lookupCookie:n,cookieMinutes:r,cookieDomain:i,cookieOptions:a}=t;n&&typeof document<`u`&&gi.create(n,e,r,i,a)}},vi={name:`querystring`,lookup(e){let{lookupQuerystring:t}=e,n;if(typeof window<`u`){let{search:e}=window.location;!window.location.search&&window.location.hash?.indexOf(`?`)>-1&&(e=window.location.hash.substring(window.location.hash.indexOf(`?`)));let r=e.substring(1).split(`&`);for(let e=0;e<r.length;e++){let i=r[e].indexOf(`=`);i>0&&r[e].substring(0,i)===t&&(n=r[e].substring(i+1))}}return n}},yi={name:`hash`,lookup(e){let{lookupHash:t,lookupFromHashIndex:n}=e,r;if(typeof window<`u`){let{hash:e}=window.location;if(e&&e.length>2){let i=e.substring(1);if(t){let e=i.split(`&`);for(let n=0;n<e.length;n++){let i=e[n].indexOf(`=`);i>0&&e[n].substring(0,i)===t&&(r=e[n].substring(i+1))}}if(r)return r;if(!r&&n>-1){let t=e.match(/\/([a-zA-Z-]*)/g);return Array.isArray(t)?t[typeof n==`number`?n:0]?.replace(`/`,``):void 0}}}return r}},bi=null,xi=()=>{if(bi!==null)return bi;try{if(bi=typeof window<`u`&&window.localStorage!==null,!bi)return!1;let e=`i18next.translate.boo`;window.localStorage.setItem(e,`foo`),window.localStorage.removeItem(e)}catch{bi=!1}return bi},Si={name:`localStorage`,lookup(e){let{lookupLocalStorage:t}=e;if(t&&xi())return window.localStorage.getItem(t)||void 0},cacheUserLanguage(e,t){let{lookupLocalStorage:n}=t;n&&xi()&&window.localStorage.setItem(n,e)}},Ci=null,wi=()=>{if(Ci!==null)return Ci;try{if(Ci=typeof window<`u`&&window.sessionStorage!==null,!Ci)return!1;let e=`i18next.translate.boo`;window.sessionStorage.setItem(e,`foo`),window.sessionStorage.removeItem(e)}catch{Ci=!1}return Ci},Ti={name:`sessionStorage`,lookup(e){let{lookupSessionStorage:t}=e;if(t&&wi())return window.sessionStorage.getItem(t)||void 0},cacheUserLanguage(e,t){let{lookupSessionStorage:n}=t;n&&wi()&&window.sessionStorage.setItem(n,e)}},Ei={name:`navigator`,lookup(e){let t=[];if(typeof navigator<`u`){let{languages:e,userLanguage:n,language:r}=navigator;if(e)for(let n=0;n<e.length;n++)t.push(e[n]);n&&t.push(n),r&&t.push(r)}return t.length>0?t:void 0}},Di={name:`htmlTag`,lookup(e){let{htmlTag:t}=e,n,r=t||(typeof document<`u`?document.documentElement:null);return r&&typeof r.getAttribute==`function`&&(n=r.getAttribute(`lang`)),n}},Oi={name:`path`,lookup(e){let{lookupFromPathIndex:t}=e;if(typeof window>`u`)return;let n=window.location.pathname.match(/\/([a-zA-Z-]*)/g);if(Array.isArray(n))return n[typeof t==`number`?t:0]?.replace(`/`,``)}},ki={name:`subdomain`,lookup(e){let{lookupFromSubdomainIndex:t}=e,n=typeof t==`number`?t+1:1,r=typeof window<`u`&&window.location?.hostname?.match(/^(\w{2,5})\.(([a-z0-9-]{1,63}\.[a-z]{2,6})|localhost)/i);if(r)return r[n]}},Ai=!1;try{document.cookie,Ai=!0}catch{}var ji=[`querystring`,`cookie`,`localStorage`,`sessionStorage`,`navigator`,`htmlTag`];Ai||ji.splice(1,1);var Mi=()=>({order:ji,lookupQuerystring:`lng`,lookupCookie:`i18next`,lookupLocalStorage:`i18nextLng`,lookupSessionStorage:`i18nextLng`,caches:[`localStorage`],excludeCacheFor:[`cimode`],convertDetectedLanguage:e=>e}),Ni=class{constructor(e){let t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{};this.type=`languageDetector`,this.detectors={},this.init(e,t)}init(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{languageUtils:{}},t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:{},n=arguments.length>2&&arguments[2]!==void 0?arguments[2]:{};this.services=e,this.options=fi(t,this.options||{},Mi()),typeof this.options.convertDetectedLanguage==`string`&&this.options.convertDetectedLanguage.indexOf(`15897`)>-1&&(this.options.convertDetectedLanguage=e=>e.replace(`-`,`_`)),this.options.lookupFromUrlIndex&&(this.options.lookupFromPathIndex=this.options.lookupFromUrlIndex),this.i18nOptions=n,this.addDetector(_i),this.addDetector(vi),this.addDetector(Si),this.addDetector(Ti),this.addDetector(Ei),this.addDetector(Di),this.addDetector(Oi),this.addDetector(ki),this.addDetector(yi)}addDetector(e){return this.detectors[e.name]=e,this}detect(){let e=arguments.length>0&&arguments[0]!==void 0?arguments[0]:this.options.order,t=[];return e.forEach(e=>{if(this.detectors[e]){let n=this.detectors[e].lookup(this.options);n&&typeof n==`string`&&(n=[n]),n&&(t=t.concat(n))}}),t=t.filter(e=>e!=null&&!pi(e)).map(e=>this.options.convertDetectedLanguage(e)),this.services&&this.services.languageUtils&&this.services.languageUtils.getBestMatchFromCodes?t:t.length>0?t[0]:null}cacheUserLanguage(e){let t=arguments.length>1&&arguments[1]!==void 0?arguments[1]:this.options.caches;t&&(this.options.excludeCacheFor&&this.options.excludeCacheFor.indexOf(e)>-1||t.forEach(t=>{this.detectors[t]&&this.detectors[t].cacheUserLanguage(e,this.options)}))}};Ni.type=`languageDetector`;var Pi={brandDocs:`Docs`,navHome:`Home`,navDocs:`Docs`,navSponsor:`Sponsor`,navAria:`Site navigation`,openMenu:`Open menu`,startCreating:`Start creating`,sidebarAria:`Documentation`,onThisPage:`On this page`,tocAria:`On this page`,langLabel:`Language`,docTitleSuffix:`recombyn Docs`,legalNavAria:`Legal`,legalTagline:`Editable design through conversation`,groups:{guide:`Guides`,features:`Features`,faq:`FAQ`,support:`Support`},pages:{"getting-started":`Getting started`,canvas:`Canvas & tools`,shortcuts:`Keyboard shortcuts`,agent:`Using Agent`,"custom-models":`Custom & third-party models`,"image-generation":`Image generation`,"video-generation":`Video generation`,audio:`Audio`,lottie:`Lottie`,assets:`Assets`,"image-tools":`Image editing tools`,skills:`Skills`,account:`Account & credits`,desktop:`Desktop app`,overview:`Feature overview`,plaza:`Plaza & inspiration`,import:`Import files`,"export-share":`Export & share`,faq:`FAQ`,sponsor:`Sponsor`,terms:`Terms of Service`,privacy:`Privacy Policy`,"ai-terms":`AI terms`,about:`About`}},Fi={brandDocs:`Docs`,navHome:`首页`,navDocs:`文档`,navSponsor:`赞助`,navAria:`站点导航`,openMenu:`打开菜单`,startCreating:`开始创作`,sidebarAria:`文档目录`,onThisPage:`本页目录`,tocAria:`本页目录`,langLabel:`语言`,docTitleSuffix:`recombyn 文档`,legalNavAria:`法律文档`,legalTagline:`用对话做出可编辑的设计`,groups:{guide:`使用指南`,features:`产品功能`,faq:`常见问题`,support:`支持项目`},pages:{"getting-started":`快速入门`,canvas:`画布与工具`,shortcuts:`快捷键`,agent:`Agent 用法`,"custom-models":`自定义与第三方模型`,"image-generation":`图片生成`,"video-generation":`视频生成`,audio:`音频`,lottie:`Lottie 动画`,assets:`资产`,"image-tools":`图片编辑工具`,skills:`技能（Skills）`,account:`账户与积分`,desktop:`桌面端`,overview:`功能概览`,plaza:`广场与灵感`,import:`导入文件`,"export-share":`导出与分享`,faq:`FAQ`,sponsor:`赞助`,terms:`服务条款`,privacy:`隐私政策`,"ai-terms":`AI 说明`,about:`关于`}},Ii={brandDocs:`Docs`,navHome:`首頁`,navDocs:`文件`,navSponsor:`贊助`,navAria:`站點導覽`,openMenu:`開啟選單`,startCreating:`開始創作`,sidebarAria:`文件目錄`,onThisPage:`本頁目錄`,tocAria:`本頁目錄`,langLabel:`語言`,docTitleSuffix:`recombyn 文件`,legalNavAria:`法律文件`,legalTagline:`用對話做出可編輯的設計`,groups:{guide:`使用指南`,features:`產品功能`,faq:`常見問題`,support:`支持專案`},pages:{"getting-started":`快速入門`,canvas:`畫布與工具`,shortcuts:`快捷鍵`,agent:`Agent 用法`,"custom-models":`自訂與第三方模型`,"image-generation":`圖片生成`,"video-generation":`影片生成`,audio:`音訊`,lottie:`Lottie 動畫`,assets:`資產`,"image-tools":`圖片編輯工具`,skills:`技能（Skills）`,account:`帳戶與積分`,desktop:`桌面端`,overview:`功能概覽`,plaza:`廣場與靈感`,import:`匯入檔案`,"export-share":`匯出與分享`,faq:`FAQ`,sponsor:`贊助`,terms:`服務條款`,privacy:`隱私權政策`,"ai-terms":`AI 說明`,about:`關於`}},Li={brandDocs:`Docs`,navHome:`ホーム`,navDocs:`ドキュメント`,navSponsor:`スポンサー`,navAria:`サイトナビゲーション`,openMenu:`メニューを開く`,startCreating:`作成を始める`,sidebarAria:`目次`,onThisPage:`このページ`,tocAria:`このページの目次`,langLabel:`言語`,docTitleSuffix:`recombyn ドキュメント`,legalNavAria:`法的情報`,legalTagline:`会話で編集可能なデザインを`,groups:{guide:`ガイド`,features:`機能`,faq:`よくある質問`,support:`サポート`},pages:{"getting-started":`はじめに`,canvas:`キャンバスとツール`,shortcuts:`ショートカット`,agent:`Agent の使い方`,"custom-models":`カスタム / サードパーティモデル`,"image-generation":`画像生成`,"video-generation":`動画生成`,audio:`音声`,lottie:`Lottie`,assets:`アセット`,"image-tools":`画像編集ツール`,skills:`Skills`,account:`アカウントとクレジット`,desktop:`デスクトップ`,overview:`機能概要`,plaza:`広場とインスピレーション`,import:`ファイルのインポート`,"export-share":`書き出しと共有`,faq:`FAQ`,sponsor:`スポンサー`,terms:`利用規約`,privacy:`プライバシーポリシー`,"ai-terms":`AI について`,about:`About`}},Ri=[{code:`en`,label:`English`},{code:`zh-CN`,label:`简体中文`},{code:`zh-TW`,label:`繁體中文`},{code:`ja`,label:`日本語`}],zi={en:{common:Pi},"zh-CN":{common:Fi},"zh-TW":{common:Ii},ja:{common:Li}};Lr.use(Ni).use(ni).init({resources:zi,fallbackLng:`en`,defaultNS:`common`,detection:{order:[`localStorage`,`navigator`],lookupLocalStorage:`language`,caches:[`localStorage`]},interpolation:{escapeValue:!1}}).then(()=>{typeof document<`u`&&(document.documentElement.lang=Lr.resolvedLanguage||Lr.language||`en`)}),Lr.on(`languageChanged`,e=>{typeof document<`u`&&(document.documentElement.lang=e)});function Bi(e){let t=String(e||``).trim();return t===`zh-CN`||t===`zh-TW`||t===`en`||t===`ja`?t:t===`zh`||t.startsWith(`zh-Hans`)?`zh-CN`:t.startsWith(`zh-Hant`)||t===`zh-HK`||t===`zh-MO`?`zh-TW`:t.startsWith(`ja`)?`ja`:(t.startsWith(`en`),`en`)}var Vi=`# FAQ

## Sign-in & account

**Not receiving verification code?**  
Check spam; confirm email spelling; wait for cooldown and retry.

**Google sign-in failed?**  
Allow pop-ups / third-party cookies in the browser; or use email sign-in.

## Credits & billing

**No balance / Plans / redeem — and no credit number on Send?**  
**Local desktop** and most **self-host** deploys keep platform billing **off** (\`WALLET_BILLING_ENABLED=false\` by default). Those entries and cost chips stay hidden, and the API won’t block on platform balance. Operators who want a SaaS wallet set the flag to \`true\`. See [Account & credits](/guide/account#when-credits--plans-are-hidden).

**Self-host shows “insufficient credits / tokens”?**  
Check whether \`WALLET_BILLING_ENABLED=true\` was set by mistake; default is off. Restart the API after changing it — the UI hides credit chrome and skips platform charges. Local desktop always skips the platform wallet.

**Charged credits but no result?**  
(Only when platform billing is on.) Design Agent holds usually refund on failure; **image tools** often charge first and may not auto-refund. Note the time, check **Usage & billing**, and report in-product.

**Free quota used up?**  
Free tier gets about **1** design trial per day (usually Auto). Wait for next-day reset, or upgrade / redeem a card key.

**How much do image tools cost?**  
Remove background, upscale, adjust, expand, multi-angle have fixed reference costs; text-to-image by model and count. See [Image editing tools](/guide/image-tools) and the number beside the button.

**Do third-party models spend platform credits?**  
**BYOK image / video generation** usually does not; **Design Agent** canvas runs may still hold / settle platform credits even with a third-party model. See [Custom & third-party models](/guide/custom-models) and [Account & credits](/guide/account).


**Where is the billing ledger?**  
Account → Usage & billing (or similar). See [Account & credits](/guide/account).

## Canvas & sync

**Home cover not latest draft?**  
Leaving the editor force-syncs document and cover; hard-refresh Home. If still wrong, make a small edit on canvas, save, and return.

**Canvas content lost after refresh?**  
When signed in, cloud is source of truth; confirm sign-in and network. Local draft tries to keep unsynced edits.

**Layers panel missing artboards?**  
Frames and shape / image nodes appear together; hide, lock, and reorder. New frames stack on top. See [Canvas & tools](/guide/canvas).

**I deleted an Uploading image/video, but Undo brought it back?**  
Deleting an upload placeholder aborts the transfer and **cannot be undone**. If it reappears after refresh, cloud sync may still have the old doc—wait and refresh, or check the network. See [Canvas & tools · Video](/guide/canvas#video).

## Agent & image generation

**Difference between Auto / Ask / Image / Video?**  
Auto edits the canvas directly; Ask answers / proposes a plan with an ops preview and applies only after **Confirm**; Image focuses on stills; Video focuses on video. Long runs support pause and resume. See [Using Agent](/guide/agent).

**Checkpoint undo lost after refresh / snapshot invalid?**  
Some checkpoints are session-only and expire after refresh. Keep or export important results. See [Using Agent · Checkpoints](/guide/agent#checkpoints--restore).

**Auto picked wrong model?**  
In Account → Agent (or Auto routing in the model popover), switch Standard / Pro / Max, or set **custom lanes** for fast / standard / reasoning / multimodal / image; or lock a model manually. See [Using Agent · Auto routing](/guide/agent#auto-routing-preferences).

**Do custom lanes call five models at once?**  
No. Each turn uses one lane (plus an optional image step). Five slots are a “task type → model” table.

**How do I add a third-party model?**  
Account → Agent → Third-party models: **platform catalog** (e.g. OpenRouter, often API key only) or **manual entry** (model ID, base URL; kinds include text / vision / image / video). Web usually needs Plus+. See [Custom & third-party models](/guide/custom-models).

**Local desktop has no platform models / how to package?**  
Local builds omit the platform LLM catalog — bring your own key. Installers and EXE paths: [Desktop](/guide/desktop).

**Image gen slow or failing?**  
Check credits, network, and model status; retry with another model or lower resolution / count. Generator nodes may show “no image returned.”

**How do I switch among multiple generated images?**  
Select the image node → “N images” → set as main or detach to its own node. See [Image editing tools](/guide/image-tools).

## Plaza, import & share

**Plaza submission never appears?**  
Needs admin review; revise from feedback and resubmit. See [Plaza & inspiration](/features/plaza).

**Layout broken after import?**  
Tune artboard size and layers, or ask Agent to tidy. See [Import](/features/import).

**Share link won’t let others edit?**  
Preview-only cannot edit. Editable requires the other person signed in and invited as collaborator (or owner). See [Export & share](/features/export-share).

## Still stuck?

See feedback options in [About](/legal/about). Product UI wins when docs differ. Shortcuts: [Shortcuts](/guide/shortcuts).
`,M=`# Export & share

## Export

Top bar **Export** menu:

| Entry | Notes |
|-------|--------|
| **Export all pages** | Each artboard when you have several |
| **Export selection** | Current selection / frame |
| **Export JSON** | Project document for backup / re-import |

### Formats

| Case | Formats |
|------|---------|
| Normal artboard / graphics | **PNG** / **JPG** / **SVG** |
| **Video only** selected | **MP4**, or audio track as **MP3** |
| **Lottie only** selected | **JSON** |

Scale about \`0.5x–4x\` (SVG usually 1x). JPG can enable compression. See also [Video](/guide/video-generation), [Audio](/guide/audio), [Lottie](/guide/lottie).

## Share links

| Type | Notes |
|------|--------|
| **Preview only** | View with the link; **no sign-in** |
| **Editable** | Sign-in required; owner + invited collaborators can edit |

## Invite collaborators

Share panel → invite by username / email / user id → manage the list.

## Follow viewport

During realtime collab, the **presence avatars** (not inside the Share dialog): click an avatar to **follow** their viewport; click again or pan/zoom yourself to stop.

## Publish to Plaza

Submit for admin review. Cover rules: [Plaza & inspiration](/features/plaza).
`,Hi=`# Import files

Home can import **local images** into an editable canvas.

> PDF / Word (DOCX) import is **not** supported in the current product. If older copy still mentions PDF / Word, this page is authoritative.

## Types

| Type | Notes |
|------|-------|
| **Images** | Image nodes; use [Image tools](/guide/image-tools) and Agent |

Common formats: PNG, JPG, WEBP, GIF, and similar. Extensions and size limits follow upload UI hints.

## Suggested flow

1. Import from Home (or drop an image if supported).
2. Wait for upload → editor.
3. Check **artboard size** for the target scene.
4. Tidy order in [Layers](/guide/canvas#layers); hide unused layers.
5. Use Agent for style / copy / images; refine manually as needed.

## Notes

- Imported projects still sync, export, and share normally.
`,Ui=`# Features overview

## Canvas workspace

Infinite canvas, multi artboards, vector / bitmap mix; select, shapes, pen, brush (eraser), bucket, text, image / video upload, image generator. Videos support trim, crop, extract frame, and more. Layers manage frames and nodes (visibility, lock, order); multi-select align / distribute. See [Canvas & tools](/guide/canvas).

## Chat modes

**Auto** / **Ask** / **Image** / **Video**, with checkpoints, “Undo to this step”, and pause / resume on long runs. Auto: Standard / Pro / Max / Custom lanes. See [Using Agent](/guide/agent).

## Custom & third-party models

Account → Agent: platform catalog (OpenRouter, Volcengine, …) or manual compatible endpoints; kinds include text / vision / image / video. See [Custom & third-party models](/guide/custom-models).

## Desktop

Local (SQLite + API sidecar) and Cloud desktop builds, including packaging output paths. See [Desktop app](/guide/desktop).

## Media, assets & edit

**Image** ([Image generation](/guide/image-generation)), **video / audio / Lottie** via right-click Generators ([Video](/guide/video-generation), [Audio](/guide/audio), [Lottie](/guide/lottie)), **Assets** dock ([Assets](/guide/assets)), **Skills** on Home ([Skills](/guide/skills)). Image edit tools: [Image tools](/guide/image-tools).



## Import

Images → editable canvas. See [Import](/features/import).

## Plaza

Official / community cases; submit for review. See [Plaza](/features/plaza).

## Sync & account

Cloud sync when signed in; Ctrl + S to save. Plans, credits, billing, card keys, notices, Agent prefs: [Account & credits](/guide/account).

## Export & share

Common image formats (scale, all pages); view or edit links; invite collaborators. See [Export & share](/features/export-share).
`,Wi=`# Plaza & inspiration

Browse **official** and community work, then open a copy in your editor.

## Browse

Tabs like **Recommended / Latest / Following**. Categories include website, mobile, image, **video**, poster, drawing, and more. Opening a case copies it into your project.

## Detail actions

| Action | Notes |
|--------|--------|
| **Remix / make same** | Copy into your project and open the editor |
| **Use prompt / image** | Bring case prompt or media into your flow |
| **Like** | Saved under Liked |
| **Follow creator** | Appear in Following |
| **Share** | Share the inspiration link when available |

## Publish

1. Prepare a **cover artboard** (pick a representative frame; match cover aspect when required).
2. Title and submit.
3. Shown publicly only after **admin approval**.

Follow [Terms](/legal/terms). Revise and resubmit if rejected.

## Profile

**Published**, **Liked**, and **Assets** (ties to [Assets](/guide/assets) when shown). Profile share may still be “coming soon”.
`,Gi=`# Account & credits

## Open Account

After sign-in, open settings from the avatar / account entry. Common sections:

| Section | Contents |
|---------|----------|
| **Profile** | Display name, bio, avatar |
| **Plans** | Membership tiers, benefits, upgrade |
| **Credits / wallet** | Balance, estimated cost hints |
| **Usage & billing** | Top-ups and model usage ledger |
| **Redeem card key** | Membership or credit packs |
| **Agent** | Auto routing prefs, third-party models |

Labels may vary slightly in the product UI.

## Unified credits

One wallet currency: **credits** (chat, Agent, image gen, image tools — see the ledger).

Typical cloud / web charging:

| Capability | Rough rule |
|------------|------------|
| **Design Agent** (auto canvas edits, etc.) | Hold first, then settle by usage; holds usually refund on failure |
| **Some chat endpoints** | Fixed per-call charge (independent of prompt length) |
| **Platform image / video generation** | By model, count / specs; estimate often beside the button |
| **Image tools** (remove bg, upscale, expand, multi-angle, …) | Fixed per-run rates; **charge before run**; failures **may not** auto-refund today |
| **BYOK image / video generation** | Usually **no** platform credits |
| **BYOK + Design Agent** | Upstream uses your key; platform may still hold / settle credits |

Membership grants a monthly pool. Low balance can block send / generate; upgrade, redeem a key, or wait for free-tier daily reset.

BYOK details: [Custom & third-party models](/guide/custom-models).

## When credits / Plans are hidden

Platform billing is **off** in these cases — the UI hides balance, Plans, redeem, Usage & billing, and send-button credit chips; the API does not hold or charge:

| Case | Notes |
|------|--------|
| **Local desktop** | Always off (\`DESKTOP_LOCAL_AUTO_LOGIN\`) |
| **Self-host / private deploy** | API env **\`WALLET_BILLING_ENABLED\` defaults to \`false\`**; set \`true\` only if you want SaaS-style wallet |
| **Recombyn Cloud / production web** | Credits UI appears when the operator enables billing |

With billing off, bring your own model keys; upstream fees use your provider. You should not hit platform “insufficient credits / tokens” blocks. See [Desktop](/guide/desktop).

## Plans

| Tier | Rough positioning (see in-product Plans) |
|------|------------------------------------------|
| **Free** | No monthly grant; about **1** design run per day (usually forced Auto) |
| **Standard (Plus)** | Monthly credits; pick platform models; add third-party models |
| **Pro** | Higher monthly credits; custom models and deeper features |
| **Ultra** (if offered) | Highest quota and priority |

“≈ N chats / N images” on cards are **estimates** for common models; real cost varies.

### Switching plans

- Paid plans usually **cannot switch** until expiry; then you can change.
- Same-tier renewal or **credit card keys** may still redeem (follow on-screen rules).

## Usage & billing

Under **Usage & billing** (or similar), review top-ups / grants and spend.

If credits were charged with no result: Design Agent holds usually refund; **image tools** often charge first and may not auto-refund — note the time and report in-product.

## Redeem card keys

1. Open redemption and enter a key (often \`XXXXX-XXXXX-XXXXX-XXXXX\`).
2. Common types:
   - **Membership**: activates a plan and monthly credit grant
   - **Credits**: adds credits to the balance
3. Takes effect immediately. Generally non-refundable except where law or explicit policy requires otherwise.

External “buy card key” links may appear in the product.

## Agent preferences (Account → Agent)

Same config as the editor Auto popover.

### Auto routing

| Preference | Effect |
|------------|--------|
| Standard | Platform default lane table |
| Pro / Max | Stronger preset lane → model maps |
| Custom lanes | Pick models for fast / standard / reasoning / multimodal / image |

**Only when chat model is Auto.** See [Agent · Auto routing](/guide/agent#auto-routing-preferences).

### Third-party models

Platform catalog and manual entry. On web sign-in, keys may be stored encrypted in an account vault; see [Custom & third-party models](/guide/custom-models). Web needs Plus+; local desktop: [Desktop](/guide/desktop).

## Profile

- Display name, bio, avatar (avatars go to object storage, not long-term base64 in DB).
- Sign-in: email or Google (as registered).
- Email accounts can **change password** in settings; Google-only accounts usually have no email password.

## Notices

**Notices** (or message center) lists announcements; mark all read when available.

## Related

- [Using Agent](/guide/agent)
- [Custom & third-party models](/guide/custom-models)
- [Desktop](/guide/desktop)
- [Image generation](/guide/image-generation)
- [Image tools](/guide/image-tools)
- [Export & share](/features/export-share)
- [FAQ](/faq/)
`,Ki=`# Using Agent

The right-side chat is recombyn’s design Agent: understand briefs, edit the canvas, generate images, and iterate. Press **C** to open / close the panel; **Ctrl + Shift + L** adds canvas selection to the conversation.

## Interaction modes

Switch in the chat input area (labels follow the product UI):

| Mode | Common label | Behavior |
|------|--------------|----------|
| **Auto** | Auto / auto execute | Directly edits the canvas (layout, add elements, swap colors / images, etc.) |
| **Ask** | Ask — consult first | Answers / proposes a plan; shows an ops preview and applies only after you **Confirm** |
| **Image** | Image — image generation | Focused on text-to-image / reference-to-image; adjust resolution, aspect ratio, count, and model |
| **Video** | Video — video generation | Like the canvas [video generator](/guide/video-generation); preview in chat; often archived to [Assets](/guide/assets) for drag-to-canvas |

Type **\`/\`** to pin a [Skill](/guide/skills) for the turn; **\`@\`** for attachments.

You can **stop** anytime after sending.
 Long runs support **pause** and **resume** from a checkpoint; after refresh (when chat is synced), pending Ask confirms usually remain available.

## Checkpoints & restore

After Agent edits the canvas, chat shows **checkpoints** (snapshots):

| Action | Notes |
|--------|-------|
| **Undo** | Drop this turn’s canvas changes |
| **Keep** | Confirm the result |
| **View** | Preview that checkpoint (per UI) |
| **Undo to this step** | On history, restore the canvas to that checkpoint |

Some checkpoints **expire after refresh** (“snapshot invalid”). Keep or export important results.

## Activity log

While running: thinking, skill / rule / knowledge / aesthetics lookup, canvas size, tool calls, image steps — useful when stuck.

## Attachments & @ references

Upload with **+**, or **Ctrl + V** paste in chat. Type \`@\` to search and reference **attachments already added in the current conversation**, e.g. “follow this reference.”

The \`@\` panel does not search models, projects, or canvas nodes. Pick models via the model button below the input; add canvas selection with **Ctrl + Shift + L**.

## Model choice: Auto vs lock

Open the **model button** under the input. Common sections: **Design** / **Image** / **Video**.

| Choice | Behavior |
|--------|----------|
| **Auto** | System picks a **lane** for this turn, then maps it to a model (below) |
| **A platform model** | Locks that model for the turn (and until you switch back); Auto lane map is overridden to the same model |
| **Third-party custom model** | Uses your own API key and endpoint; **image / video generation** usually skips platform credits; **Design Agent** canvas runs may still hold platform credits (see [Custom & third-party models](/guide/custom-models)) |

Free tier usually allows **Auto** only (about **1** design trial per day); paid plans can pick platform models. **Local desktop** has no platform catalog — configure BYOK in [Desktop app](/guide/desktop).

Image models include Doubao Seedream, GPT Image, Nano Banana Pro / Nano Banana 2, etc. (list in product). Details: [Image generation](/guide/image-generation).

## Auto routing preferences

**Applies only when the chat model is Auto.** Configure in either place (same local storage):

1. **Account settings → Agent** (full form)
2. Compact **Auto routing** card in the Agent / Ask model popover

### Preference presets

| Preference | Meaning |
|------------|---------|
| **Standard** | Platform default lane → model table |
| **Pro** | Stronger reasoning / vision lane map |
| **Max** | Flagship quality-first map |
| **Custom lanes** | You assign a model per lane |

Pro / Max / Custom send a \`route_overrides\` map with the request; Standard follows the platform Admin defaults.

### Five lanes (Custom)

You are not “running this model immediately.” You are filling a **task type → model** map. Lanes are **not** all called at once.

| Lane | Meaning | Typical use |
|------|---------|-------------|
| **Fast lane** | Short Q&A, tiny tweaks, no redesign | “Make the title red” |
| **Standard lane** | Typical canvas edits | Layout / color / local poster edits |
| **Reasoning lane** | Blank create, multi-artboard, design systems, hard multi-step | “Build a full site from scratch” |
| **Multimodal** | Must understand attached images | Style from a reference / screenshot |
| **Image model** | Image-generation catalog slot (not a chat lane) | When the pipeline needs AI photos |

Price tags (Cheap / Moderate / Costly) are guidance only; only the lane chosen for this turn runs.

### How the backend decides (summary)

1. With Auto, the client sends your lane map (or Pro / Max preset).
2. The backend **classifies the lane** (cheap structured LLM router; heuristic fallback):
   - Images + understand intent → **Multimodal**
   - Empty / long / from-scratch → **Reasoning**
   - Short edit on existing content → **Fast**
   - Ask mode without images → prefer **Fast**
   - Otherwise → **Standard**
3. Looks up the model for that lane; if images are present but the model cannot see them, soft-switches to the **Multimodal** slot.
4. Image generation uses the **Image model** slot (separate from chat); platform image gen bills per image, BYOK image gen usually skips platform credits.
5. Retries may follow a platform fallback chain; retry caps are platform-managed.

When you lock a model: fast / standard / reasoning / multimodal all pin to that model.

## Third-party models (bring your own key)

Under **Account → Agent → Third-party models** you can:

- Use a **platform catalog** (e.g. OpenRouter, Volcengine Ark) — often only an API key is required.
- Or **manual entry** (provider name, model ID, base URL; kinds: text / vision / image / video).

Web and Cloud desktop usually need Plus+. **Local desktop** has no platform catalog — add your own keys.

Full field guide and billing split: **[Custom & third-party models](/guide/custom-models)**. Installers and output paths: **[Desktop app](/guide/desktop)**.

## Skills

Home rail **Skills** manages official / personal packs (upload \`.zip\`, toggles). In chat, \`/\` pins a Skill for the turn. See **[Skills](/guide/skills)**.

## Full design flow (Home / kickoff)


When starting a full-page design from Home or Agent:

### Run mode

| Mode | Description |
|------|-------------|
| **Agent pipeline** | Skill-chain collaboration; backend routes models by task |
| **Single-model draw** | Direct output from a chosen model, without the full skill pipeline |

### Collaboration pace

| Pace | Description |
|------|-------------|
| **Human-in-the-loop** | Pause for confirmation each stage (default) |
| **Key milestones** | Pause only at important milestones |
| **Fully automatic** | Run end-to-end (you can still stop anytime) |

Scenario types include website, mobile app, image, poster / banner, etc.

## Sessions & activity

- **New chat** and **history** (count capped per product).
- Free tier: daily Auto trials; manual model pick may be plan-gated.

## Credits & billing

On **Cloud / platform billing on**, chat, Agent, and image generation share one credit balance. Balance, ledger, plans, and card keys: [Account & credits](/guide/account).

Local desktop and default self-host keep billing off — no balance UI, cost chips, or platform holds.
`,qi=`# Assets

The left **Assets** dock lists AI-**generated** media saved to your account (images, videos, audio) so you can drag them onto the canvas again.

Open it from the **Assets** control in the bottom HUD (or left area). You can drag the dock edge to resize.

## What appears here?

| Kind | Notes |
|------|--------|
| **Image** | Results saved after text-to-image / image-to-image succeeds |
| **Video** | Results from the video generator or Agent Video mode |
| **Audio** | Results from the audio generator / related pipelines |

Items come from the generation pipeline’s archive—not a local upload library. After you generate via image / video / audio generators or Agent **Image** / **Video** modes, entries usually show up here.

**Lottie** nodes are not stored in Assets (see [Lottie](/guide/lottie)). Manual uploads onto the canvas are **not** auto-added.

## How to use

1. Open Assets; **Refresh** if you need the latest list.
2. **Click** a thumb to preview (image / video, per UI).
3. **Drag onto the canvas** to place (same idea as dragging an image from chat).
4. Hover an item to **Delete** it from your asset library (careful).
5. Use **Load more** for pagination.

Editing (remove background, upscale, etc.) still happens on canvas nodes via [Image tools](/guide/image-tools).

## Assets vs canvas / layers

| | Assets dock | Canvas / layers |
|--|-------------|-----------------|
| Scope | Account-level generation library | Nodes in the current project |
| Place | Drag in → new node | Already in the document |
| Delete asset | Removes the library entry | Does not remove copies already on the canvas |

## Related

- [Image generation](/guide/image-generation)
- [Video generation](/guide/video-generation)
- [Audio](/guide/audio)
- [Canvas & tools](/guide/canvas)
- [Using Agent](/guide/agent)
- [Image tools](/guide/image-tools)
`,Ji=`# Audio

Place an **audio generator** (TTS or local upload), then trim or change speed. Results show in [Assets](/guide/assets) and can be dragged back onto the canvas.

## Audio generator

1. Right-click empty canvas → **Generators → Audio generator**.
2. Either:
   - **TTS**: enter text, pick a speech model, **Generate**;
   - **Upload**: attach local \`audio/*\` (or \`@\` an audio asset) and generate to skip TTS.
3. On success the node becomes an **audio node**.

Common upload types: \`mp3\` / \`wav\` / \`ogg\` / \`m4a\` / \`aac\` / \`flac\`. TTS is often MP3. Credits may show beside Generate — see [Account & credits](/guide/account).

Toolbar **Upload file** or drop \`audio/*\` also creates audio nodes.

## Editing

Both actions create a **copy** (original unchanged):

| Action | Notes |
|--------|--------|
| **Trim** | Confirm a range → “Trimmed audio” nearby |
| **Speed** | About \`0.1×–4×\` → “Speed-changed audio” |

## Export

With **only a video** selected, export can save **MP3** (audio track). Pure audio-node export follows the live UI; reuse via Assets is the usual path.

## Related

- [Video generation](/guide/video-generation)
- [Assets](/guide/assets)
- [Canvas & tools](/guide/canvas)
- [Export & share](/features/export-share)
`,Yi=`# Canvas & tools

Infinite canvas with multiple **smart artboards**. Switch tools on the bottom bar; selection shows alignment, style, and fill controls. Press **C** for Agent. Full list: [Shortcuts](/guide/shortcuts).

## Toolbar

| Tool | Shortcut | Notes |
|------|----------|-------|
| Select | V | Click / marquee; drag empty canvas to pan |
| Hand | H | Pan; or hold Space |
| Shapes | R / L / O … | Rect, line, arrow, ellipse, polygon, star |
| Pen | P | Anchor paths; Esc / Enter to finish |
| Brush | Shift + P | Free draw; eraser on toolbar; brush library / stamps |
| Paint bucket | B | Fill shape with current stroke color |
| Text | T | Add text; font, weight, size; Markdown editing |
| Smart artboard | F | Drag a frame; then size presets, fill, lock, clip overflow |
| Upload file | I | Local **image / video / audio / Lottie JSON** |
| Image generator | A | Text-to-image node — [Image generation](/guide/image-generation) |

More generators: right-click empty canvas → **Generators** for video / audio / Lottie ([Video](/guide/video-generation), [Audio](/guide/audio), [Lottie](/guide/lottie)).

The bottom HUD opens the left **Assets** dock (image / video / audio). See [Assets](/guide/assets).


## Smart artboards


- Multiple frames per project (e.g. phone + poster); size presets grouped by scene.
- Frame toolbar: presets, board color, lock, clip overflow, flip.
- **New frames stack on top** in layer order; reorder via Layers or shortcuts.
- Export, share preview, and Plaza covers prefer the current / best frame.

## Layers

| Capability | Notes |
|------------|-------|
| Scope | Lists **frames** and shape / text / image / video nodes together |
| Search | Filter by name |
| Order | Drag or shortcuts; matches canvas z-order |
| Hide / show | Eye toggle (frames too) |
| Lock | Prevent accidental edits |
| Naming | Image generator nodes show as “Image generator” (UI wording may vary) |

Shortcuts: \`]\` / \`[\` front / back; \`Ctrl + ]\` / \`Ctrl + [\` up / down; \`Ctrl + Shift + H\` visibility; \`Ctrl + Shift + K\` lock.

**Minimap** (bottom-left) frames the viewport; grid snap can be toggled.

## Multi-select & align

- Marquee or Shift-click for multi-select toolbar.
- Align, distribute, match size, and related actions (per toolbar).
- Single select: fill, stroke, radius, blend, opacity, etc.

## Fill & style

Solid, linear gradient, radial gradient, and **mesh / diffuse** fills with editable control points.

## Stroke

Open paths and stroked shapes expose width, alignment, cap, and join in the stroke panel. Defaults:

| Object | Cap | Join |
|--------|-----|------|
| Line, pen | Butt | Miter |
| Brush (pencil), arrow | Round | Round |

Panel values override defaults. Closed paths typically omit the cap control.

## Path edit & outline stroke

- **Double-click** a pen / path node to enter path edit. Subtools: select, pen (add anchors), curve (Alt / Option convert-point behavior).
- **Outline stroke** bakes the stroke into an editable filled path. Single open paths use geometric offset; multi-subpath strokes (e.g. arrows) use one silhouette matching paint. Pencil centerlines are sparsified before offset to keep anchors manageable.
- After outlining, stroke ink becomes fill; line / pen / pencil / arrow drop SVG stroke to avoid a double outline.

## Text & fonts

- Double-click to edit; basic Markdown.
- Font family, weight, size; searchable platform fonts.
- To extract editable text from an image, ask Agent in natural language.

## Images

Image nodes use [Image editing tools](/guide/image-tools). For generation use **A** or Agent **Image** mode.

## Video

- Upload, drop, or use [Video generation](/guide/video-generation) (Generators / Agent Video).
- Selected: trim, crop, flip, **Extract frame**, fullscreen, download; export MP4 / MP3 (audio track).
- Deleting an uploading placeholder aborts upload and **cannot be undone**.

## Audio & Lottie

- **Audio**: upload or [Audio generator](/guide/audio); trim / speed create copies.
- **Lottie**: upload \`.json\` or [Lottie generator](/guide/lottie); play, loop, speed, replace / export JSON. Not stored in Assets.

## Brush

Brush (**Shift + P**): free draw, eraser, brush library / stamps, hardness / pressure (see UI).

## Save & sync


Auto cloud sync when signed in; **Ctrl + S** to save. Leaving the editor syncs document and cover. Cloud wins across devices; local draft keeps unsynced edits when possible. See [FAQ](/faq/).

## Navigation tips

Space / Hand to pan; wheel to zoom; Ctrl + 0 = 100%; Shift + 1 = fit all. Drag corners to scale.
`,Xi=`# Custom & third-party models

You can connect your **own API keys** (BYOK) to OpenAI- / Claude-compatible providers instead of using only platform models.

Entry: **Account settings → Agent → Third-party models**. After saving, models appear in the chat **model picker**.

## Who can add them?

| Environment | Requirement |
|-------------|-------------|
| **Web / Cloud desktop** | Usually **Plus** or higher; the UI prompts to upgrade if needed |
| **Local desktop** | No membership gate; local builds have **no platform model catalog**, so you **must** add your own keys to chat / generate |

## Two ways to add

Open Third-party models and pick a **provider**:

### 1. Platform catalog (recommended)

Built-in platforms (e.g. **OpenRouter**, **Volcengine Ark / Doubao** — see the live UI).

1. Pick a platform.
2. Usually paste only the **API Key** (base URL and common models autofill).
3. Save. Catalog text / image / video models for that platform show up in the picker.

Some platforms also support **Add model**: with a saved key, register an extra model ID (ID, display name, icon, kind: text / vision / image / video).

### 2. Manual entry

Choose **Manual entry** for any compatible endpoint:

| Field | Meaning |
|-------|---------|
| **Model kind** | **Text** (chat edits), **Vision** (understand refs), **Image**, **Video** |
| **Provider name** | Display label |
| **Website** | Optional |
| **Model ID** | Upstream \`model\` field — not a custom display name |
| **API Key** | Your secret |
| **Base URL** | Compatible endpoint; \`http(s)://…\`, **no** trailing \`/\` |

Whether image / video generation actually works depends on the upstream API and product wiring for that kind.

## Where to select

1. Open the Agent panel on the right.
2. Click the **model** button under the composer.
3. Tabs are usually **Design** / **Image** / **Video** (see the live UI).

## Billing (what the product actually charges)

Upstream fees always use **your** provider quota.

When platform billing is **off** (local desktop, or self-host \`WALLET_BILLING_ENABLED=false\`), **no** platform credits are charged and the UI hides balance / cost chips. See [Account & credits · When credits are hidden](/guide/account#when-credits--plans-are-hidden).

On **Recombyn Cloud** (billing on), platform charges depend on the path:

| Capability | Platform credits |
|------------|------------------|
| **Image / video generation** with BYOK / catalog keys | **No** |
| **Design Agent** canvas edits (hold + settle) | **Yes** — even if the model is third-party |

Free tier is usually Auto-only; picking platform or third-party models generally needs Plus+ (except local desktop / billing-off self-host). Platform models and image tools: see [Account & credits](/guide/account).


## How keys are stored

- When signed in on the web, keys may be encrypted into an account **vault** so the server can call upstream on your behalf (still **your** key).
- A local copy may also be kept; clearing site data or wiping local desktop app data can require re-adding keys.
- Never paste keys into public issues or chats.

## FAQ

**Save disabled / upgrade prompt?**  
Web and Cloud desktop need Plus+. Local desktop can usually save without membership.

**Saved but missing from the picker?**  
Confirm you clicked Save; refresh and reopen the picker. For manual entry, check model ID and base URL.

**Why am I still charged with a third-party model?**  
Only when platform billing is **on**: Design Agent canvas runs still hold / settle. Pure BYOK **image / video generation** usually does not. Local desktop and default self-host skip platform credits entirely.


**No Seedream etc. on local desktop?**  
Expected — local builds omit the platform LLM catalog. Add OpenRouter / Ark or a manual endpoint. See [Desktop](/guide/desktop).

## Related

- [Using Agent](/guide/agent)
- [Account & credits](/guide/account)
- [Desktop app](/guide/desktop)
- [Image generation](/guide/image-generation)
- [Image tools](/guide/image-tools)
`,Zi=`# Desktop app

recombyn ships a **Tauri** desktop app in two flavors:

| Flavor | Use | API |
|--------|-----|-----|
| **Local** | On-device data & models | Bundled API + SQLite on \`127.0.0.1:8000\` |
| **Cloud** | Desktop shell + online account | Default \`https://recombyn.com\` |

## Local vs Cloud

| | Local | Cloud |
|--|-------|-------|
| Login | OS user **auto-login** | Same as web |
| Projects | Local SQLite | Cloud sync |
| Platform LLM catalog | **None** | Same as web |
| Third-party models | **Required** to chat / generate | Plus+ typically |
| Plans / redeem / balance | **Hidden** (platform billing off) | Same as web when Cloud billing is on |
| Chat / gen / image-tool wallet | **No** platform credits (no hold, no balance block) | Same as web |

Configure keys: [Custom & third-party models](/guide/custom-models). Self-host defaults to billing off (\`WALLET_BILLING_ENABLED=false\`) — see [Account & credits · When credits are hidden](/guide/account#when-credits--plans-are-hidden).

## Dev & packaging commands

From the repo root (Node + \`npm install\`; Local release also needs Rust and Python — see \`docs/desktop.md\`):

\`\`\`bash
npm run dev:desktop
npm run dev:desktop:cloud
npm run build:desktop:sidecar
npm run build:desktop
npm run build:desktop:cloud
\`\`\`

Force rebuild sidecar then app (PowerShell):

\`\`\`powershell
$env:RECOMBYN_REBUILD_SIDECAR="1"; npm run build:desktop
\`\`\`

## Output paths

After a successful \`build:desktop\` / \`build:desktop:cloud\`:

| Artifact | Path |
|----------|------|
| Installers (NSIS / MSI, …) | \`apps/web/src-tauri/target/release/bundle/\` |
| Unpacked EXE | \`apps/web/src-tauri/target/release/recombyn.exe\` |
| API sidecar (staging) | \`apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe\` |

Deeper engineering notes: repo \`docs/desktop.md\`.

## FAQ

**Request failed after switching to Local?** Re-login / let auto-login run; stale cloud JWT won’t match a fresh SQLite DB.

**Still see email OTP?** Auto-login failed — restart \`dev:desktop\` or clear local DB per \`docs/desktop.md\`.

**Sidecar build fails?** \`pip install -e ".[desktop]"\` in \`apps/api\`, then \`npm run build:desktop:sidecar\`.

**Port 8000 in use?** Quit other API / desktop processes.

**Want cloud billing?** Use **Cloud** desktop or the website, not Local.

## Related

- [Custom & third-party models](/guide/custom-models)
- [Account & credits](/guide/account)
- [Getting started](/guide/getting-started)
- [FAQ](/faq/)
`,Qi=`# Getting Started

Welcome to **recombyn**: describe your goal in natural language, generate and refine posters, interfaces, and graphics on an infinite canvas, and keep an editable structure you can continue working with.

## Step 1: Sign in

1. Open [recombyn.com](https://recombyn.com).
2. Sign in with email verification code or Google.
3. After signing in, you can use the home page, project library, and editor.

Your first sign-in creates an account. On Cloud / when platform billing is on, chat, Agent, and image generation share one credit balance; local desktop and default self-host hide the wallet UI.

## Step 2: Learn the workspace

| Area | Purpose |
|------|---------|
| Home | Pick a category, send a brief, import files, browse inspiration, and see recent projects |
| Editor canvas | Infinite canvas + multiple artboards, manual edits, image tools; left **Assets** dock to reuse generations |

| Agent panel (right) | Auto / Ask / Image / Video; optional Auto routing |
| Account | Profile and Agent prefs; Plans / credits on Cloud when billing is on |

## Step 3: Create your first project

Choose any of these:

- **Send a brief from Home**: Pick poster / mobile app / website / image, describe your goal, and send → enter the editor and let Agent start the draft (you can adjust collaboration pace and run mode).
- **Blank canvas**: Use **+** in the sidebar to create an empty project, then draw yourself or press **C** to open Agent.
- **Inspiration cases**: Open a case in [Plaza](/features/plaza), copy it to your own project, and keep editing.
- **Import files**: Turn images into an editable canvas. See [Import files](/features/import).

## Step 4: Revise with Agent or the generator

1. Describe changes in the right-side input (e.g. “Make the title larger and switch the main color to deep blue”). Choose **Agent** to edit the canvas directly, or **Ask** to review a plan first.
2. For pure image generation: choose **Image** mode, or press **A** to place an [Image generator](/guide/image-generation).
3. Upload or paste images first, then use \`@\` to reference attachments in the current conversation; pick **Auto** or a specific model via the model button.
4. You can stop generation at any time. After results land on the artboard, you can still edit manually or use [Image editing tools](/guide/image-tools) for remove background, expand, multi-angle, and more.

In Account, set Auto to **Standard / Pro / Max / Custom lanes**, and add third-party keys via [Custom & third-party models](/guide/custom-models). Desktop packaging: [Desktop app](/guide/desktop). Also [Using Agent](/guide/agent) and [Account & credits](/guide/account).

## Step 5: Export and share

- **Export**: Export PNG / JPG / SVG, etc. by artboard or selection, with optional scale and export-all-pages.
- **Share**: Generate a link; preview links need no sign-in; edit links require sign-in to save. See [Export & share](/features/export-share).

## Tips for new users

- Cloud: free tier includes daily Auto trials; Plans / card keys / Usage & billing when billing is on. Local / default self-host have no platform-credit UI.
- Work syncs to the cloud (Cloud); leaving the editor auto-saves the document and cover.
- Account **Notices** covers product announcements (may be hidden on local desktop).
- Common keys: Space to pan, scroll wheel to zoom, **C** to toggle Agent, **A** for the image generator, **F** for artboards; full list in [Shortcuts](/guide/shortcuts).
- Stuck? Check [FAQ](/faq/) first; legal and privacy: [Terms of Service](/legal/terms).
`,$i=`# Image generation

recombyn offers two common ways to generate images: an **image generator node on the canvas**, and **Image mode in Agent chat**. Both share resolution, aspect ratio, count, and model settings.

## Image generator node

1. Click **Image generator** in the bottom toolbar, or press **A**.
2. A generator card appears at the viewport center; the input shows **only when that node is selected**.
3. Enter a prompt; upload references with **+**, or use \`@\` to reference existing attachments.
4. Tap setting chips to adjust: **resolution · aspect ratio · count** (e.g. \`2K · 1:1 · 1 image\`).
5. Pick an image model and send (when platform billing is on, confirm the estimated cost beside the button).

On success, the node becomes a normal image node; if multiple images were generated, extras go to **multi-image variants** on that image—you can switch the main image or split into separate nodes. On failure, you may see “Image generation failed” or “No image returned”; retry with a new prompt / model.

### Common settings

| Item | Options |
|------|---------|
| Resolution | SD 1K / HD 2K / UHD 4K |
| Aspect ratio | Auto, 21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 |
| Count | 1–4 images |
| Smart aspect | Model confirms ratio from content |

When platform billing is on, credit cost appears beside the send button (lightning icon + number), based on model and count. Local desktop / default self-host hide the chip and skip platform charges.

### Platform vs BYOK

- **Web / Cloud**: Seedream, GPT Image, etc. are platform models and spend **platform credits**.
- **Third-party image kind**: add via [Custom & third-party models](/guide/custom-models) (catalog or manual). Uses your quota.
- **Local desktop**: no platform image catalog — configure BYOK. See [Desktop app](/guide/desktop).

## Agent **Image** mode

Switch modes at the bottom of the right chat (labels follow the product UI):

| Mode | Description |
|------|-------------|
| **Auto** | Direct canvas edits: layout, add elements, swap images, etc. |
| **Ask** | Answers / proposes a plan; shows an ops preview and applies only after **Confirm** |
| **Image** | Focused text-to-image / reference-to-image; controls similar to generator node |
| **Video** | Focused video generation (see UI and model list) |

In **Image** mode, describe the scene and attach references to generate in chat and place on canvas. Home briefs can also pick image scenarios for a full design kickoff.

## References & @

- **Reference images**: upload locally, or paste in chat (Ctrl + V).
- **@**: pick from attachments already in the current conversation—“continue from this reference.”
- **Model**: choose separately via the model button below the input, not in the \`@\` panel.

With an existing image selected, toolbar **Chat** edits via image-to-image (see [Image editing tools](/guide/image-tools)).

Successful generations are usually archived in the left [Assets](/guide/assets) dock for preview and reuse on the canvas.

## Relation to full design flow


Starting website / mobile app / poster, etc. from Home also offers:

- **Run mode**: Agent pipeline (skill chain + auto routing) or single-model draw.
- **Collaboration pace**: human-in-the-loop / key milestones / fully automatic (see [Using Agent](/guide/agent)).

For pure image generation, prefer the generator node or Agent **Image** mode.
`,ea=`# Image editing tools

Select an **image node** on the canvas; the image toolbar appears at the top. When platform billing is on, most AI actions show credit cost before you confirm; local desktop / default self-host hide the chip and skip platform charges.

## Main toolbar

| Tool | Purpose |
|------|---------|
| **Chat** | Prompt-based edit (image-to-image); optional references, model, and resolution |
| **Upscale** | Super-resolution to **4K** or **8K** presets |
| **Remove background** | Cutout; choose “portrait / fine hair” or “product / hard edge” |
| **Eraser tool** | Brush a mask; confirmed erase removes those pixels |
| **Multi-angle** | Adjust viewpoint and regenerate (below) |
| **More …** | Expand, adjust, crop, flip & rotate |
| Blend / opacity | Photoshop-style blend modes |
| Corner radius | Rounded corners where supported |
| Export / fullscreen preview | Export single node or view fullscreen |

## More menu

| Action | Description |
|--------|-------------|
| **Expand** | Outpaint / extend canvas—good for backgrounds and margins |
| **Adjust** | Light, exposure, contrast, highlights / shadows, white / black point; saturation, temperature, tint; auto presets included |
| **Crop** | Drag crop box on canvas |
| **Flip & rotate** | Horizontal / vertical flip and angle |

Crop and expand open a session-style edit on canvas; confirm writes back to the node.

## Multi-angle

Panel split into **skybox** / **camera**:

- Presets: front, side, reverse angle, three-quarter, top-down, low angle, etc.
- Sliders: rotation, tilt, zoom (near / mid / far)
- **Apply now** generates per credits and replaces the current image

## Chat quick edit

1. Select image → **Chat**.
2. Describe the change (e.g. “warm lighting”, “remove background clutter”).
3. Optional references, model, and count; current image is the main reference.
4. Shows “Editing…” while generating; result writes to the node (multiple images go to variants).

If the image was AI-generated, the input may prefill the original prompt for fine-tuning.

## Multi-image variants

When multiple images were generated, the node shows “N images”:

- **View all**: expand all results
- **Set as main**: pick which one displays
- **Separate node**: split one onto the canvas for independent editing

## Reference credits (tools)

Cloud default rates **when platform billing is on** (no model unit price). LLM-backed tools are **charged before the run**; failures **may not** auto-refund today. Local vision / no-LLM tools skip platform credits.

Local desktop and self-host with \`WALLET_BILLING_ENABLED=false\`: **no** platform charges and **no** cost chip on confirm.

| Tool | Approx. credits |
|------|-----------------|
| Remove background | **0** (local cutout) |
| Edit text / edit elements (layers) | **0** (local OCR / vision) |
| Adjust (CSS filters in the client) | **0** |
| Eraser and other pure canvas edits | **0** (no billing API) |
| Upscale | 20 |
| Vectorize, etc. | 20 |
| Expand | 30 |
| Multi-angle | 30 |
| Replace text | 30 |

Text-to-image / image-to-image billed separately by model and count—see the number beside the button when billing is on. See [FAQ](/faq/) and [Account & credits](/guide/account).

## Agent-related capabilities

Some actions run mainly via Agent tools, e.g. splitting text in an image into editable layers (**Edit text**). Describe in natural language; no need to memorize tool entry points.
`,ta=`# Lottie

Use a **Lottie generator** for short motion, or upload **Lottie JSON**. Either way you get a playable **Lottie** node.

> Lottie is **not** stored in the Assets dock (Assets are mainly image / video / audio). Manage on canvas or by exporting JSON.

## Lottie generator

1. Right-click empty canvas → **Generators → Lottie generator**.
2. Describe the motion; optional **reference image** (multimodal models work better).
3. In **Lottie settings**, set aspect and duration, pick a model, **Generate**.
4. On success the node becomes a **Lottie animation**.

### Typical settings

| Setting | Options (see live UI) |
|---------|------------------------|
| Aspect | 1:1 (common default), 16:9, 9:16, 4:3, 3:4 |
| Duration | About 1 / 2 / 3 / 5 / 8 / 10s (common default 3s) |

## Upload JSON

Toolbar **Upload file**, drop, or paste \`.json\` to create a Lottie node. Invalid files show “Invalid Lottie JSON”.

## Node toolbar

| Action | Notes |
|--------|--------|
| Play / pause | Preview |
| Loop | Toggle looping |
| Speed | Commonly \`0.5× / 1× / 1.5× / 2×\` |
| Replace | Upload a new \`.json\` |
| Download / export | Lottie JSON; selection export format is **JSON** when only Lottie is selected |

## Related

- [Image generation](/guide/image-generation)
- [Video generation](/guide/video-generation)
- [Canvas & tools](/guide/canvas)
- [Export & share](/features/export-share)
`,na=`# Shortcuts

Open the shortcuts panel in the editor for the full list (Mac shows ⌘; Windows / Linux use Ctrl). Common bindings below.

## Canvas navigation

| Action | Shortcut |
|--------|----------|
| Pan canvas | Space + drag (or hand tool H) |
| Pan by dragging empty canvas | Drag blank area with select tool |
| Zoom with scroll wheel | Scroll wheel |
| Zoom to 100% | Ctrl + 0 |
| Zoom in / out | Ctrl + + / Ctrl + - |
| Zoom to fit all content | Shift + 1 |
| Save project | Ctrl + S |

## Tool switching

| Action | Shortcut |
|--------|----------|
| Select | V |
| Hand (pan) | H |
| Smart artboard | F |
| Text | T |
| Pen | P |
| Brush | Shift + P |
| Paint bucket | B |
| Rectangle | R |
| Line | L |
| Arrow | Shift + L |
| Ellipse | O |
| Upload image | I |
| Image generator node | A |
| Open / close Agent panel | C |
| Exit path edit / close panel | Esc |

## Node editing

| Action | Shortcut |
|--------|----------|
| Copy / cut / paste | Ctrl + C / X / V |
| Duplicate | Ctrl + D |
| Select all (with select tool) | Ctrl + A |
| Undo | Ctrl + Z |
| Redo | Ctrl + Shift + Z (or Ctrl + Y) |
| Delete selection | Delete (Backspace reserved for text editing) |

## Layer order

| Action | Shortcut |
|--------|----------|
| Bring to front / send to back | ] / [ |
| Move up / down one layer | Ctrl + ] / Ctrl + [ |
| Show / hide selected layer | Ctrl + Shift + H |
| Lock / unlock selected layer | Ctrl + Shift + K |

## Chat (Agent)

| Action | Shortcut |
|--------|----------|
| Open / close Agent | C |
| Type @ to pick added attachments | @ |
| Paste image or content into chat | Ctrl + V |
| Add canvas selection to chat | Ctrl + Shift + L |
| Send message | Enter |
| Insert line break | Shift + Enter |
| Cancel edit / close panel | Esc |

## Tips

- Pen / path edit: **Enter** or **Esc** to finish; the path-edit toolbar switches Select / Pen / Curve before confirming.
- Inline text edit: **Esc** to exit.
- Multi-image variants overlay, shortcuts panel, and other overlays: **Esc** to close.
`,ra=`# Skills

**Skills** are enableable packs: official built-ins or your own \`.zip\`. When enabled, Agent / chat can follow their instructions; in the composer, type \`/\` to **pin a Skill for the current turn**.

## Skill toolbox

On Home, open the left rail **Skills**.

| Tab | Notes |
|-----|--------|
| **Official** | Platform skills; turn off ones you don’t need |
| **Mine** | Uploaded skills; enable, preview instructions, delete |

## Upload

1. In **Mine**, **Upload skill** → choose a \`.zip\`.
2. A **security scan** runs; only packs that pass appear in the list.
3. Same name → option to overwrite and update.

Don’t upload malicious or unsafe archives. Scan rules follow in-product copy.

## \`/\` in chat

1. Open the Agent panel.
2. Type **\`/\`**, search, and pick a Skill.
3. A chip pins it for the **current turn**.

\`@\` is for attachments; \`/\` is for Skills. Enable common skills in the toolbox, then pin with \`/\` when needed.

## Relation to Agent pipelines

Full design runs and Auto canvas edits may walk a **skill chain** (visible in the activity log). Toolbox toggles and \`/\` pins control availability and per-turn selection. See [Using Agent](/guide/agent).

## Related

- [Using Agent](/guide/agent)
- [Getting started](/guide/getting-started)
- [Custom & third-party models](/guide/custom-models)
`,ia=`# Video generation

Two common paths: a **video generator node** on the canvas, and Agent **Video** mode. Settings (aspect, resolution, duration, model) largely match.

## Video generator node

1. Right-click empty canvas → **Generators → Video generator** (the toolbar Image generator only places image nodes).
2. With the node selected, describe the clip.
3. Set **aspect · resolution · duration**, pick a video model; estimated credits may show beside Generate.
4. Attach **reference images** with **+** or \`@\` (video attachments may be allowed; model refs are mainly images).
5. On success the node **becomes a video node** in place.

### Typical settings

| Setting | Options (see live UI) |
|---------|------------------------|
| Aspect | 16:9 (common default), 9:16, 1:1, 4:3, 3:4 |
| Resolution | 480p, 720p (common default), 1080p |
| Duration | About 4–15s (common default 5s) |

Platform video models spend **platform credits**; BYOK video kinds usually do not (see [Custom & third-party models](/guide/custom-models)).

## Agent Video mode

Switch the right chat to **Video**. Results appear as a **playable gallery in chat**. To place on canvas from the library, open [Assets](/guide/assets) and drag the **video** entry. Successful runs are usually archived as assets.

## Video nodes on canvas

| Action | Notes |
|--------|--------|
| Trim / crop | Adjust clip and framing |
| Extract frame | Creates a nearby image node for [Image tools](/guide/image-tools) |
| Fullscreen / download | Preview and save locally |
| Export | With only a video selected: **MP4**, or audio track as **MP3** — [Export & share](/features/export-share) |

Upload via toolbar **Upload file** or drop \`video/*\`. Deleting an “Uploading…” placeholder aborts and cannot be undone.

## Related

- [Image generation](/guide/image-generation)
- [Assets](/guide/assets)
- [Using Agent](/guide/agent)
- [Canvas & tools](/guide/canvas)
- [Export & share](/features/export-share)
`,aa=`# About us

**Editable design through conversation.**

recombyn is a design Agent: describe your goal in natural language; it generates and refines posters, UI, and graphics on an infinite canvas—keeping structure you can keep editing.

## What it is

Turn “what you want” into a workable design. The Agent breaks down intent, picks layouts and assets, places them on artboards, and iterates in chat. You can always edit nodes, swap images, and tune typography by hand.

## Indie-built

recombyn is built by an independent developer in spare time. The goal is simple: make conversation-driven design genuinely useful.

If you’d like to help keep the project going, see the [Sponsor](/sponsor) page (voluntary — no pressure).

## What you can do

- From a single poster or icon set to mobile / web layouts
- Import references; expand, multi-angle, remove background, and more on canvas
- Auto routing or pick models; members can connect BYOK compatible providers
- Publish to Plaza; share preview or collab-edit links
- Run full Agent flows automatically, or pause at key milestones

## Plans & billing

Free tier for light trials (daily Auto runs). Paid tiers grant monthly unified credits (chat / Agent / images) and may unlock model pick and third-party models. Card keys redeem plans or credit top-ups. Ledger under Account → Usage & billing. See in-product Plans and [Account & credits](/guide/account).

## Feedback

The product iterates quickly. For bugs, generation issues, or feature ideas, use **notices** and feedback entry points in Account settings.

## No white-label / impersonation

recombyn is source-available: personal use and single-org internal deploy are fine. **Without authorization you may not** reskin and sell it, offer it as a public sign-up hosted service, or impersonate the official brand / site / support.

- Official: [recombyn.com](https://recombyn.com)
- Docs: [Getting started](/guide/getting-started)
- Source: [github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

Report clones or unauthorized hosting to \`702680355@qq.com\` (include links and screenshots). See the repo [LICENSE](https://github.com/recombyn/recombyn/blob/main/LICENSE).

## Links

- [Start creating](https://recombyn.com)
- [Getting started](/guide/getting-started)
- [Terms of Service](/legal/terms)
- [Privacy Policy](/legal/privacy)
- [AI Service Terms](/legal/ai-terms)
`,oa=`# AI Service Terms

> Last updated: July 28, 2026

This document supplements the [Terms of Service](/legal/terms) and covers AI-related capabilities. For how-to guides see [Using Agent](/guide/agent), [Image generation](/guide/image-generation), and [Image tools](/guide/image-tools).

## 1. Scope of AI capabilities

Including but not limited to:

- Conversational design Agent (Agent / Ask / Image modes)
- Text-to-image / image-to-image and canvas image editing tools
- Automatic model selection (**Auto**) and user routing preferences (Standard / Pro / Max / custom lanes)
- Membership **compatible third-party endpoints** (bring-your-own API key)

Actual models, lists, and quotas follow the in-product offering.

## 2. Platform models vs third-party models

**Platform models** (cloud vendors, aggregators, etc.): necessary prompts, reference images, canvas summaries, and tool context may be sent to providers under their terms and privacy policies.

**Your third-party providers (BYOK)**:

- API keys and endpoint settings are typically stored only in your browser ([Privacy Policy](/legal/privacy)).
- Requests go to services you specify; their policies govern processing.
- We do not warrant availability, compliance, or quality of third-party endpoints—use only services you are authorized to use and trust.

## 3. Auto routing

With Auto, the system may classify a task “lane” (e.g. fast / standard / reasoning / multimodal) then map to a model; image generation may use a separate image slot. Routing, retries, and safety rules are platform-managed and may change. Custom lanes only change the mapping table. See [Using Agent](/guide/agent#auto-routing-preferences).

## 4. Output & review

AI output may be inaccurate, incomplete, or biased, and may not meet brand or local legal requirements. Review and edit before formal use. You are responsible for content you adopt.

## 5. Prohibited uses

Do not use AI to generate or spread unlawful, infringing, fraudulent, hateful, or harmful content; do not bypass security, quotas, or billing; do not attach others’ keys or unauthorized endpoints.

## 6. Content ownership

Your prompts and uploads, and editable designs on the canvas, follow “User content” in the Terms of Service. Model providers may retain request logs for a limited period per their policies.

## 7. Credits & fees

- **Platform model** chat, Agent, image gen, and image tools may consume unified credits; retry and refund rules follow in-product display (image tools often charge first and may not auto-refund).
- **BYOK**: image / video generation usually skips platform credits; Design Agent canvas runs may still hold / settle platform credits. You pay the provider separately.
- Platform image gen or image tools in the same flow still bill platform credits.

See [Account & credits](/guide/account).

## 8. Changes

We may add or remove models, adjust routing, lane defaults, or quotas. Material changes communicated in-product or via notices where possible.
`,sa=`# Privacy Policy

> Last updated: July 28, 2026

> When providing input to **recombyn**, do not submit sensitive personal information about yourself or others (e.g. national ID numbers, precise home addresses, financial accounts, health data).

## 1. Information we collect

To provide the Service we may collect:

| Category | Examples |
|----------|----------|
| **Account** | Email, display name, bio, avatar, sign-in method (email / Google) |
| **Session & security** | Sign-in state, verification-related records, necessary security logs |
| **Project content** | Canvas documents, uploaded images, project covers |
| **Usage & billing** | Credit balance and ledger, plan info, card-key redemption outcomes (full key plaintext is not kept for long-term display) |
| **Collaboration & sharing** | Share-link settings, collaborator identifiers you add (username / email / ID) |
| **Plaza** | Submitted work metadata and covers, review-related info |
| **Product communication** | Feedback you send; read state of in-account notices / announcements |
| **Diagnostics** | API errors, performance and anti-abuse logs |

With Google or other third-party sign-in, we receive basic profile data within your authorization scope.

## 2. How we use information

We use the above to: create and maintain accounts, save and render designs, provide AI assistance, billing and credit redemption, collaboration / sharing and Plaza display, security and abuse prevention, product announcements / notices, and product improvement.

## 3. Local storage (browser)

Some data is stored **only on your device** and is typically not uploaded as our server-side credentials, for example:

- **Third-party model API keys** and custom provider settings (BYOK)
- **Auto routing preferences** (Standard / Pro / Max / custom lane maps)
- Language, theme, and some UI preferences

Clearing site data removes these local settings; you may need to sign in again or re-enter keys. Do not store sensitive keys on shared computers.

## 4. Storage & security

Cloud data may live on servers, databases, or object storage we configure. Avatars and project covers reference cloud storage URLs. We take reasonable technical and administrative measures but cannot guarantee absolute security.

## 5. Third-party services

The Service may rely on third parties (cloud, platform LLM APIs, sign-in providers, payment / card-key channels).

- **Platform models**: necessary prompts, reference images, and canvas context may be sent to model providers under their terms and privacy policies.
- **Your configured endpoints (BYOK)**: requests go to **providers you specify**; how they process data is governed by their policies. We cannot control those providers—only add endpoints you trust.
- We share only as needed for functionality; please also read relevant third-party privacy notices.

## 6. Plaza, sharing & collaboration

Publishing to Plaza, enabling share links, or inviting collaborators may make content visible to other users, link holders, or invitees. Do not publish personal or confidential information you do not want public. Preview links may be viewable without sign-in.

## 7. Cookies & similar technologies

We use cookies / localStorage for sign-in, language, theme, routing preferences, etc. Clearing them may require signing in again or lose local preferences (including third-party keys).

## 8. Your choices

Update profile, manage projects and share permissions, clear local preferences, or contact us for account-related requests. Where law allows, you may request access, correction, or deletion of personal information about you.

## 9. Minors

The Service is mainly for users with full legal capacity. If below local minimum age, use with guardian consent and guidance.

## 10. Policy updates

We may update this Privacy Policy. Material changes will be communicated in-product or via [notices](/guide/account) where possible. Continued use means you acknowledge the updated policy.

## 11. Contact

Privacy questions: see [About us](/legal/about).
`,ca=`# Terms of Service

> Last updated: July 28, 2026

Welcome to recombyn (the “Service”). By accessing or using the Service, you have read and agree to these Terms of Service. If you do not agree, stop using the Service.

## 1. Acceptance

Using the Service means you agree to these terms. We may apply them together with the [Privacy Policy](/legal/privacy) and [AI Service Terms](/legal/ai-terms). Help docs explain product features; if they conflict with these Terms, these Terms control.

## 2. Service description

recombyn provides design assistance via conversation and tools, including but not limited to: infinite canvas and multi-artboard editing, Agent / Ask / Image modes, text-to-image and image editing tools, Auto model routing, third-party compatible models (bring-your-own key), file import, export and collaborative sharing, and Plaza. Features may change; we will try to announce material changes in advance.

## 3. Account & security

You are responsible for account credentials and sign-in activity. Do not lend or transfer your account for unlawful or abusive use. Contact us promptly if you notice unauthorized access. You must safeguard third-party API keys stored on your device; costs or losses from key leakage at the provider are your responsibility.

## 4. User content

Content you upload, create, or publish (designs, copy, images, etc.) belongs to you. You grant us a limited license to process and display as needed to provide the Service (e.g. render, store, Plaza display, share preview). Ensure you have rights to materials used and that content does not infringe third-party rights.

## 5. Acceptable use

Do not use the Service for unlawful activity, including but not limited to: IP infringement, malware, harassment, bypassing billing or quotas, attacking the system or abusing automated requests, or generating unlawful or harmful AI content. We may limit, suspend, or terminate violating accounts within reasonable bounds.

## 6. Credits, plans & card keys

- Chat, Agent, platform image generation, and some image tools may consume **unified credits**.
- Membership plans follow the in-product Plans page (monthly grants and capability differences such as model pick and third-party models).
- **BYOK**: image / video generation usually skips platform credits; Design Agent and similar paths may still use platform credits. Provider fees are yours.
- Card keys may redeem membership or credit top-ups; redemption is generally non-refundable except where law or our explicit commitment requires otherwise.
- Plan switching during an active paid term follows in-product rules.

Details: product UI and [Account & credits](/guide/account).

## 7. Sharing & collaboration

You may share projects via links (preview or editable) and invite collaborators. You control disclosure scope; assess risks of content you choose to share. Collaborators must follow these Terms; owners may manage the collaborator list.

## 8. Disclaimer

The Service is provided “as is.” We strive for availability and security but do not warrant uninterrupted service, data loss, third-party model errors, availability of endpoints you connect, or fitness for a particular purpose. AI output may be inaccurate—review before formal use. Browser session checkpoints may become invalid after refresh.

## 9. Limitation of liability

To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages from use or inability to use the Service. Paid-related liability cap: amounts you paid us for the disputed matter.

## 10. Changes to terms

We may update these terms. Continued use after update means acceptance. Material changes will be communicated via in-product notice, announcements, or other reasonable means where possible.

## 11. Contact

Questions: [About us](/legal/about) or channels shown when purchasing card keys.
`,la=`# FAQ

## サインイン

**認証コードが届かない？** 迷惑メール・綴り・クールダウンを確認。  
**Google 失敗？** ポップアップ / Cookie、またはメールログイン。

## クレジット

**残高 / プランが見えない？** Local と多くのセルフホストは課金デフォルトオフ（\`WALLET_BILLING_ENABLED=false\`）。[アカウント](/guide/account#クレジット-ui-が非表示のとき)。  
**セルフホストでクレジット不足？** 誤って \`true\` にしていないか確認。オフがデフォルト。Local は常にウォレットなし。  
**消費したが結果なし？**（課金オン時）多くは返金。明細は「利用と請求」。  
**無料枠終了？** 翌日リセット、またはプラン / キー。  
**サードパーティはクレジット消費？** 課金オン時: BYOK 画像 / 動画は通常否。デザイン Agent はホールド対象になり得ます。[カスタムモデル](/guide/custom-models) / [アカウント](/guide/account)。  
**Local にプラットフォームモデルがない / 成果物パス？** [デスクトップ](/guide/desktop)。

## キャンバス

**カバーが古い？** エディタ退出で同期 → ハードリフレッシュ。  
**レイヤーにフレームがない？** フレームとノードは同一パネル。[キャンバス](/guide/canvas)。

## Agent

**Agent / Ask / Image の違いは？** Agent はキャンバス直接編集。Ask は回答 / 提案と操作プレビュー、**確認**後に適用。Image は画像生成。長時間タスクは一時停止と再開に対応。[Agent](/guide/agent)。  

**チェックポイントが無効？** リフレッシュ後に失効することがあります。重要結果は保持 / 書き出し。[Agent](/guide/agent)。  
**Auto が違う？** Standard / Pro / Max / Custom lanes、または固定。  
**Custom は 5 モデル同時？** いいえ。1 ターン 1 レーン。  
**共有リンクで編集できない？** 閲覧のみは不可。編集可はログイン＋コラボ招待。[書き出しと共有](/features/export-share)。

## まだ必要？

[About](/legal/about)。ショートカットは [ショートカット](/guide/shortcuts)。
`,ua=`# 書き出しと共有

## 書き出し

| 入口 | 内容 |
|------|------|
| 全ページ | 複数アートボード |
| 選択 | 現在の選択 / フレーム |
| JSON | プロジェクト文書のバックアップ / 再インポート |

| 場合 | 形式 |
|------|------|
| 通常 | PNG / JPG / SVG |
| 動画のみ | MP4、または音軌 MP3 |
| Lottie のみ | JSON |

倍率は約 0.5x–4x。[動画](/guide/video-generation) / [音声](/guide/audio) / [Lottie](/guide/lottie) も参照。

## 共有リンク

プレビューのみ（ログイン不要）/ 編集可（所有者と招待済みコラボ）。

## 招待

共有パネルからユーザー名 / メール / ID で招待。

## ビューポート追従

リアルタイム共同編集のアバターバーで相手を**追従**。再クリックや自力パン / ズームで解除。

## Plaza 公開

管理者承認後に公開。[広場](/features/plaza) 参照。
`,da=`# ファイルのインポート

ホームから**ローカル画像**を編集可能なキャンバスへ取り込みます。

> 現在の製品では PDF / Word（DOCX）のインポートは**非対応**です。古い説明に PDF / Word とあっても、本ページを優先してください。

| 種類 | 説明 |
|------|------|
| **画像** | 画像ノード。[画像ツール](/guide/image-tools) / Agent |

よく使う形式：PNG、JPG、WEBP、GIF など。拡張子とサイズ上限はアップロード UI に従います。

1. インポート（または画像をドロップ）→ アップロード → エディタ。  
2. アートボードサイズを確認。  
3. [レイヤー](/guide/canvas) で整理。  
4. Agent でスタイル統一、必要なら手修正。

取り込んだプロジェクトは通常どおり同期・書き出し・共有できます。
`,fa=`# 機能概要

## キャンバス

無限キャンバス、複数アートボード、ベクター / ビットマップ。レイヤーでフレームとノード管理。整列・分布。[キャンバスとツール](/guide/canvas)。

## 3 モード

Agent / Ask / Image。チェックポイントと履歴復元。長時間タスクは一時停止と再開に対応。Auto：Standard / Pro / Max / Custom。[Agent](/guide/agent)。

## メディア・アセット

画像（[画像生成](/guide/image-generation)）、右クリック生成器の動画 / 音声 / Lottie（[動画](/guide/video-generation) / [音声](/guide/audio) / [Lottie](/guide/lottie)）、アセット（[アセット](/guide/assets)）、ホームの Skills（[Skills](/guide/skills)）。編集は [画像ツール](/guide/image-tools)。



## その他

インポート、Plaza、クラウド同期、アカウント（プラン・クレジット・請求・通知）、書き出しと共有コラボ。各ガイドを参照。
`,pa=`# 広場とインスピレーション

公式・コミュニティ作品を閲覧し、自分のエディタへコピーして続けられます。

## 閲覧

おすすめ / 新着 / フォローなど。カテゴリに Web、モバイル、画像、**動画**、ポスター、ドローイングなど。

## 詳細アクション

同作を作る、プロンプト / 画像を使う、いいね、クリエイターをフォロー、共有（開放時）。

## 公開

カバー用アートボードを用意 → タイトル提出 → **管理者承認**後に公開。

## プロフィール

公開済み / いいね / アセット（[アセット](/guide/assets) と連動する場合あり）。
`,ma=`# アカウントとクレジット

## アカウントを開く

サインイン後、アバター / アカウント入口から設定を開きます。よくある区分：

| 区分 | 内容 |
|------|------|
| **プロフィール** | 表示名、紹介、アバター |
| **プラン** | 会員ランク、特典、アップグレード |
| **クレジット／ウォレット** | 残高、見込み消費 |
| **利用明細** | チャージとモデル消費 |
| **カードキー交換** | 会員またはクレジット追加 |
| **Agent** | Auto ルーティング、サードパーティモデル |

## 統一クレジット

通貨は **クレジット** のみです（対話、Agent、画像生成、画像ツールなど。明細に準拠）。

クラウド / Web の目安：

| 機能 | おおまかなルール |
|------|------------------|
| **デザイン Agent** | 先にホールドし、実用量で決済。失敗時はホールドが戻ることが多い |
| **一部チャット API** | 回数固定課金（プロンプト長と無関係な場合あり） |
| **プラットフォーム画像 / 動画生成** | モデル・枚数 / 仕様。ボタン横に見込み表示が多い |
| **画像ツール** | 回数固定。**実行前課金**。失敗時は**自動返金されない場合あり** |
| **BYOK 画像 / 動画生成** | 通常プラットフォームクレジット**非消費** |
| **BYOK + デザイン Agent** | 上流はあなたの Key。プラットフォーム側はホールド / 決済し得る |

会員は月次枠を共有します。残高不足で送信 / 生成が止まることがあります。

[カスタムモデル](/guide/custom-models) も参照。

## クレジット UI が非表示のとき

次の場合は**プラットフォーム課金オフ**です。残高・プラン・カードキー・利用明細・送信横の消費表示が隠れ、API もホールドしません。

| ケース | 内容 |
|--------|------|
| **Local デスクトップ** | 常にオフ |
| **セルフホスト** | \`WALLET_BILLING_ENABLED\` の**デフォルトは \`false\`**。SaaS 式にするときだけ \`true\` |
| **Recombyn Cloud** | 運営が課金を有効にしたときのみ本ページのウォレット表示 |

オフ時は自前のモデル Key を使います。[デスクトップ](/guide/desktop) 参照。

## プラン

| ランク | 位置づけ（製品内プランページ準拠） |
|--------|------------------------------------|
| **無料** | 月次付与なし。設計実行は 1 日およそ **1 回**（通常 Auto 強制） |
| **Standard (Plus)** | 月次クレジット。プラットフォームモデル選択とサードパーティ追加可 |
| **Pro** | より多い月次クレジット |
| **Ultra**（提供時） | 最高枠 |

## 明細と返金

失敗時：Agent ホールドは戻りやすい。**画像ツール**は先課金で自動返金されない場合があります。時刻を控えて製品内フィードバックを。

## 関連

- [Agent の使い方](/guide/agent)
- [カスタム / サードパーティ](/guide/custom-models)
- [デスクトップ](/guide/desktop)
- [FAQ](/faq/)
`,ha=`# Agent の使い方

右側のチャットが recombyn のデザイン Agent です。要件を理解し、キャンバスを編集し、画像を生成して反復します。**C** でパネル開閉、**Ctrl + Shift + L** で選択内容を会話に追加できます。

## 操作モード

入力エリアで切り替えます（ラベルは製品 UI に準拠）。

| モード | よくあるラベル | 動作 |
|--------|----------------|------|
| **自動** | 自動実行 | キャンバスを直接編集 |
| **Ask** | 相談してから | 回答 / 提案。操作プレビューを出し、**確認**後に適用 |
| **Image** | 画像生成 | テキスト／参照からの画像生成 |
| **Video** | 動画生成 | 動画生成に特化 |

送信後はいつでも**停止**できます。長時間タスクは**一時停止**と**再開**（チェックポイント）に対応。

## チェックポイントと復元

Agent がキャンバスを更新すると**チェックポイント**が出ます。取り消し / 保持 / 表示、履歴の「この手順まで取り消す」。リフレッシュ後に無効になることがあります。重要な結果は保持または書き出ししてください。


## アクティビティ

思考、スキル / ルール / 知識 / 美学、キャンバス、ツール、画像ステップを表示。

## 添付と @ 参照

**+** でアップロード、または **Ctrl + V** で貼り付け。\`@\` で**この会話に既にある添付**を参照できます。

\`@\` はモデル・プロジェクト・キャンバスノード検索には対応しません。モデルは入力下のモデルボタン、キャンバス選択は **Ctrl + Shift + L** です。

## モデル選択：Auto と固定

入力下の**モデルボタン**を開きます。よくある区分は **デザイン** / **画像** / **動画** です。

| 選択 | 動作 |
|------|------|
| **Auto** | このターンの「レーン」を選び、対応モデルへマップ |
| **プラットフォームモデル指定** | そのモデルに固定（Auto のレーン表は同一モデルで上書き） |
| **サードパーティ** | 自前 Key / エンドポイント。**画像 / 動画生成**は通常プラットフォームクレジット非消費。**デザイン Agent** はホールド対象になり得る（[カスタム / サードパーティ](/guide/custom-models)） |

無料プランは通常 **Auto** のみ（1 日およそ 1 回の設計試用）。有料プランでプラットフォームモデル選択可。


画像モデルは Doubao Seedream、GPT Image、Nano Banana Pro / 2 など（製品内リスト準拠）。詳細は [画像生成](/guide/image-generation)。

## Auto ルーティング設定

**チャットモデルが Auto のときだけ有効。** 設定場所（同じローカル保存）：

1. **アカウント → Agent**（フルフォーム）
2. Agent / Ask のモデルポップオーバー内の **Auto ルーティング**（コンパクト）

### プリセット

| 設定 | 意味 |
|------|------|
| **Standard** | プラットフォーム既定のレーン表 |
| **Pro** | より強い推論・ビジョン向けマップ |
| **Max** | 旗艦・品質優先 |
| **Custom lanes** | レーンごとにモデルを指定 |

Pro / Max / Custom では \`route_overrides\` を送信。Standard は Admin 既定に従います。

### 5 つのレーン（Custom）

「選んだ瞬間にそのモデルが走る」わけではなく、**タスク種別 → モデル** の地図です。5 スロットを同時呼び出しません。

| レーン | 意味 | 例 |
|--------|------|-----|
| **Fast** | 短い Q&A・軽微な修正 | タイトル色の変更 |
| **Standard** | 通常のキャンバス編集 | レイアウト・配色 |
| **Reasoning** | 白紙作成・複数アートボード・難タスク | サイトをゼロから |
| **Multimodal** | 添付画像の理解が必要 | スクショ準拠 |
| **Image model** | 画像生成スロット（チャットレーンではない） | パイプラインで AI 画像が必要なとき |

価格タグは目安のみ。実際に動くのはこのターンで選ばれたレーンです。

### バックエンドの判定（要約）

1. Auto 時、クライアントがレーン設定（または Pro / Max）を送る。
2. サーバが**レーンを分類**（安価な構造化ルータ、失敗時はヒューリスティック）：
   - 画像＋理解が必要 → **Multimodal**
   - 空／長い／ゼロから → **Reasoning**
   - 短い編集 → **Fast**
   - Ask かつ画像なし → **Fast** 寄り
   - それ以外 → **Standard**
3. レーンからモデルを解決。画像ありでビジョン非対応なら **Multimodal** へソフト切替。
4. 画像生成は **Image model** スロット（チャットとは別）。枚数でプラットフォーム課金（BYOK チャット除く）。
5. リトライはフォールバック連鎖。回数上限はプラットフォーム側。

モデル固定時は fast / standard / reasoning / multimodal を同一モデルにピン留めします。

## サードパーティモデル（自前 Key）

**アカウント → Agent → サードパーティ** で自前 Key を追加できます。

- **プラットフォームカタログ**（OpenRouter、Volcengine Ark など）：多くは API Key のみ。
- **手動入力**：モデル ID、Base URL、種別（対話 / マルチモーダル / 画像 / 動画）。

Web / Cloud は通常 Plus 以上。**Local デスクトップ**は会員不要だがプラットフォーム一覧なし。

詳細：**[カスタム / サードパーティモデル](/guide/custom-models)**。ビルド成果物：**[デスクトップ](/guide/desktop)**。

## フルデザインフロー（ホーム／開始）

### 実行方式

| 方式 | 説明 |
|------|------|
| **Agent パイプライン** | スキル連携。タスクに応じてモデルをルート |
| **単一モデル描画** | 指定モデルで直接出力 |

### 協働ペース

| ペース | 説明 |
|--------|------|
| **人手確認** | 各段階で確認（既定） |
| **重要マイルストーンのみ** | 要所だけ停止 |
| **完全自動** | 一気に実行（停止は可） |

シーン：Web、モバイル、画像、ポスター / バナーなど。

## セッションとアクティビティ

- 新規チャットと履歴（上限あり）。
- アクティビティ：思考、スキル / ルール / 知識 / 美学、キャンバス、ツール、画像ステップ。
- 無料：日次 Auto 試用。手動モデルはプラン制限あり。

## クレジットと請求

チャット・Agent・画像生成は同一クレジット。残高・明細・プラン・カードキーは [アカウントとクレジット](/guide/account)。
`,ga=`# アセット

エディタ左側の**アセット**パネルには、アカウントに保存された AI **生成**メディア（画像・動画など）が一覧表示され、キャンバスへ再度ドラッグして使えます。

下部 HUD（または左側）の**アセット**アイコンから開きます。端をドラッグして幅を変えられます。

## 何が表示されるか

| 種類 | 説明 |
|------|------|
| **画像** | 画像生成成功後に保存された結果 |
| **動画** | 動画生成成功後の結果 |
| **音声** | 音声生成が接続・保存されている場合（製品 UI 準拠） |

生成パイプラインのアーカイブです。ローカルアップロード用ライブラリではありません。画像ジェネレータや Agent の Image / Video モードで生成すると、通常ここに出ます。

キャンバスへ手動アップロードしたファイルは自動では入りません。

## 使い方

1. アセットを開き、必要なら**更新**。
2. サムネイルを**クリック**してプレビュー。
3. キャンバスへ**ドラッグ**して配置。
4. 項目にホバーして**削除**（注意）。
5. **もっと読み込む**でページ送り。

背景除去などの編集はキャンバス上のノードと [画像ツール](/guide/image-tools) で行います。

## アセットとキャンバスの違い

| | アセット | キャンバス / レイヤー |
|--|----------|----------------------|
| 範囲 | アカウントの生成ライブラリ | 現在のプロジェクト内ノード |
| 配置 | ドラッグで新規ノード | すでにドキュメント内 |
| 削除 | ライブラリ項目を削除 | 既に置いたコピーは別途キャンバスで削除 |

## 関連

- [画像生成](/guide/image-generation)
- [キャンバスとツール](/guide/canvas)
- [Agent の使い方](/guide/agent)
- [画像ツール](/guide/image-tools)
`,_a=`# 音声

**音声ジェネレータ**（TTS またはローカルアップロード）を置き、切り取り・速度変更できます。結果は [アセット](/guide/assets) に入り、再度ドラッグできます。

## 音声ジェネレータ

1. 右クリック → **生成器 → 音声生成器**。
2. **TTS**：テキストと音声モデルで生成。**アップロード**：\`audio/*\`（または \`@\`）で TTS をスキップ。
3. 成功すると**音声ノード**になります。

よくある拡張子：\`mp3\` / \`wav\` / \`ogg\` / \`m4a\` / \`aac\` / \`flac\`。課金は [アカウント](/guide/account)。

## 編集

どちらも**コピー**を作り、元は変えません。

| 操作 | 内容 |
|------|------|
| **切り取り** | 区間確定で横にコピー |
| **速度** | 約 \`0.1×–4×\` |

## 関連

- [動画生成](/guide/video-generation) · [アセット](/guide/assets) · [キャンバス](/guide/canvas)
`,va=`# キャンバスとツール

無限キャンバスと複数の**スマートアートボード**。下部ツールバーで切替。選択後に整列・スタイル・塗り。**C** で Agent。[ショートカット](/guide/shortcuts)。

## ツールバー

| ツール | キー | 説明 |
|--------|------|------|
| 選択 | V | クリック / 範囲選択。空キャンバスドラッグでパン |
| ハンド | H | パン。Space 長押しでも可 |
| 図形 | R / L / O など | 矩形、線、矢印、楕円、多角形、星 |
| ペン | P | アンカーパス。Esc / Enter で終了 |
| ブラシ | Shift + P | 自由描画。消しゴム、ブラシ庫 |
| バケツ | B | 現在の線色で塗り |
| テキスト | T | フォント・ウェイト・サイズ。Markdown 可 |
| スマートアートボード | F | フレーム作成。サイズ、色、ロック、クリップ |
| 画像アップロード | I | ローカル画像 / 動画 |
| 画像ジェネレータ | A | [画像生成](/guide/image-generation) |

## スマートアートボード

- プロジェクトに複数フレーム可。シーン別サイズプリセット。
- **新規フレームはレイヤースタック最上**。レイヤーまたはショートカットで並べ替え。
- 書き出し・共有プレビュー・Plaza カバーは適切なフレームを優先。

## レイヤー

フレームと図形 / テキスト / 画像を一覧。検索、並べ替え、表示 / 非表示、ロック。画像ジェネレータは「画像ジェネレータ」表記。

\`]\` / \`[\`、\`Ctrl + ]\` / \`[\`、\`Ctrl + Shift + H\` / \`K\`。左下ミニマップ、グリッドスナップ可。

## 複数選択と整列

Shift 選択で整列・分布・サイズ揃え。単一選択で塗り・線・角丸・ブレンドなど。

## 塗りとスタイル

単色、線形 / 放射グラデ、メッシュ（ディフューズ）。

## ストローク

開いたパスや線付き図形は、線幅・整列・線端・結合をパネルで設定。既定値：

| 対象 | 線端 | 結合 |
|------|------|------|
| 直線・ペン | Butt | Miter |
| ブラシ・矢印 | Round | Round |

パネルで上書き可能。閉じたパスでは線端 UI を出さないことが多い。

## パス編集とアウトライン

- ペン / パスを**ダブルクリック**でパス編集。サブツール：選択、ペン（アンカー追加）、カーブ（Alt / Option の変換点相当）。
- **アウトライン**はストロークを編集可能な塗りパスに焼く。単一開パスは幾何オフセット、複数サブパス（矢印など）は描画と一致する外輪郭。鉛筆の中心線は先に間引く。
- アウトライン後、線のインクは塗りへ。直線 / ペン / ブラシ / 矢印は SVG ストロークを重ねない。

## テキストとフォント

ダブルクリック編集。フォント検索可。画像内文字のレイヤー化は Agent に依頼。

## 動画

- ローカル動画をキャンバスにドロップ／アップロード。転送中は「アップロード中」プレースホルダ。
- 選択時：トリム、クロップ、反転、**フレーム抽出**（先頭／再生位置）、全画面、ダウンロード。
- **フレーム抽出**は動画横に静止画ノードを作成。
- アップロード中プレースホルダの削除は転送を中止し、**元に戻せません**（Ctrl+Z で復帰しない）。

## 保存と同期

ログイン時クラウド同期。**Ctrl + S** 手動保存。[FAQ](/faq/)。
`,ya=`# カスタム / サードパーティモデル

recombyn では**自分の API キー**（BYOK）を、OpenAI / Claude 互換の外部サービスに接続できます。

入口：**アカウント設定 → Agent → サードパーティモデル**。保存後、チャットの**モデル一覧**に表示されます。

## 誰が追加できるか

| 環境 | 条件 |
|------|------|
| **Web / Cloud デスクトップ** | 通常 **Plus 以上** |
| **Local デスクトップ** | 会員不要。プラットフォームモデル一覧はなく、**自分で Key を入れる必要あり** |

## 追加方法

### 1. プラットフォームカタログ（推奨）

OpenRouter、Volcengine Ark など（UI 表示に準拠）。多くは **API Key だけ**で保存できます。必要なら「モデルを追加」でカタログ外の model ID を登録（テキスト / マルチモーダル / 画像 / 動画）。

### 2. 手動入力

| 項目 | 説明 |
|------|------|
| **種類** | テキスト / マルチモーダル / 画像 / 動画 |
| **プロバイダ名** | 表示名 |
| **モデル ID** | 上流の \`model\` フィールド |
| **API Key** | 秘密鍵 |
| **Base URL** | \`http(s)://\`、末尾 \`/\` なし |

## 課金（実際の引き落としに準拠）

上流費用は**あなたの枠**です。プラットフォームクレジットを使うかは経路次第です。

| 機能 | プラットフォームクレジット |
|------|--------------------------|
| **BYOK の画像 / 動画生成** | **消費しない** |
| **デザイン Agent（キャンバス編集のホールド決済）** | **消費する**（第三者モデルでも） |

プラットフォームモデルや画像ツールの課金は [アカウントとクレジット](/guide/account) を参照。


## キーの保存

Web ログイン時、Key はアカウント側の**ボールト**に暗号化保存されることがあります（あくまであなたの Key）。端末側にも設定が残る場合があり、サイトデータ削除や Local アプリ初期化後は再登録が必要です。

## よくある質問

**第三者モデルなのにクレジットが減る？**  
デザイン Agent のキャンバス実行はホールド / 決済対象です。純 BYOK の**画像 / 動画生成**は通常対象外です。

## 関連

- [Agent の使い方](/guide/agent)
- [アカウントとクレジット](/guide/account)
- [デスクトップ](/guide/desktop)
- [画像生成](/guide/image-generation)
- [画像ツール](/guide/image-tools)
`,ba=`# デスクトップ

recombyn の **Tauri** デスクトップには 2 種類あります。

| 版 | 用途 | API |
|----|------|-----|
| **Local** | データとモデルを本機で | 同梱 API + SQLite（\`127.0.0.1:8000\`） |
| **Cloud** | デスクトップ UI + オンラインアカウント | 既定 \`https://recombyn.com\` |

## Local と Cloud

| | Local | Cloud |
|--|-------|-------|
| ログイン | OS ユーザー自動ログイン | Web と同じ |
| プラットフォームモデル | **なし** | Web と同じ |
| サードパーティ | 会話 / 生成に**必須** | 通常 Plus 以上 |
| プラン / カードキー / 残高 | **非表示**（課金オフ） | Cloud で課金オン時は Web と同じ |
| 対話 / 生成 / 画像ツールのウォレット | プラットフォームクレジット**なし** | Web と同じ |

Key の設定: [カスタム / サードパーティモデル](/guide/custom-models)。セルフホストもデフォルトで課金オフ（\`WALLET_BILLING_ENABLED=false\`）。[アカウント](/guide/account#クレジット-ui-が非表示のとき) 参照。

## 開発・パッケージコマンド

\`\`\`bash
npm run dev:desktop
npm run dev:desktop:cloud
npm run build:desktop:sidecar
npm run build:desktop
npm run build:desktop:cloud
\`\`\`

## 成果物パス

| 成果物 | パス |
|--------|------|
| インストーラ | \`apps/web/src-tauri/target/release/bundle/\` |
| EXE | \`apps/web/src-tauri/target/release/recombyn.exe\` |
| API サイドカー | \`apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe\` |

詳細はリポジトリの \`docs/desktop.md\`。

## 関連

- [カスタム / サードパーティモデル](/guide/custom-models)
- [アカウントとクレジット](/guide/account)
- [はじめに](/guide/getting-started)
- [FAQ](/faq/)
`,xa=`# はじめに

**recombyn** へようこそ。自然言語で目的を伝えるだけで、ポスター、インターフェース、グラフィックを無限キャンバス上で生成・調整でき、編集可能な構造のまま作業を続けられます。

## ステップ 1：サインイン

1. [recombyn.com](https://recombyn.com) を開きます。
2. メール認証コードまたは Google でサインインします。
3. サインイン後、ホーム、プロジェクトライブラリ、エディターを利用できます。

初回サインインでアカウントが作成されます。チャット、Agent、画像生成は、統一されたクレジット残高を共有します。

## ステップ 2：ワークスペースを知る

| エリア | 用途 |
|------|---------|
| ホーム | カテゴリを選び、ブリーフを送信し、ファイルをインポートし、インスピレーションを閲覧し、最近のプロジェクトを確認 |
| エディターキャンバス | 無限キャンバス + 複数アートボード、手動編集、画像ツール |
| Agent パネル（右側） | Agent / Ask / Image モード、任意で Auto ルーティング |
| アカウント | プラン、クレジット、プロフィール、通知 |

## ステップ 3：最初のプロジェクトを作成

次のいずれかを選びます。

- **ホームからブリーフを送信**：ポスター / モバイルアプリ / ウェブサイト / 画像を選び、目的を記述して送信 → エディターに入り、Agent が下書きを開始（協調ペースと実行モードは調整可能）。
- **空白キャンバス**：サイドバーの **+** で空のプロジェクトを作成し、自分で描くか **C** を押して Agent を開く。
- **インスピレーション事例**：[Plaza](/features/plaza) で事例を開き、自分のプロジェクトにコピーして編集を続ける。
- **ファイルをインポート**：画像を編集可能なキャンバスに変換。[ファイルのインポート](/features/import) を参照。

## ステップ 4：Agent またはジェネレーターで修正

1. 右側の入力欄に変更内容を記述します（例：「タイトルを大きくして、メインカラーを濃い青に変更して」）。キャンバスを直接編集する場合は **Agent**、まずプランを確認する場合は **Ask** を選びます。
2. 純粋な画像生成の場合：**Image** モードを選ぶか、**A** を押して [Image ジェネレーター](/guide/image-generation) を配置します。
3. 先に画像をアップロードまたは貼り付け、\`@\` で現在の会話内の添付ファイルを参照します。**Auto** またはモデルボタンで特定のモデルを選びます。
4. 生成はいつでも停止できます。結果がアートボードに配置された後も、手動編集や [画像編集ツール](/guide/image-tools)（背景除去、拡張、マルチアングルなど）を利用できます。

アカウントでは、Auto を **Standard / Pro / Max / Custom lanes** に設定でき、会員はサードパーティモデルも追加できます。[Agent](/guide/agent) / [アカウント](/guide/account) を参照。

## ステップ 5：エクスポートと共有

- **エクスポート**：アートボードまたは選択範囲ごとに PNG / JPG / SVG などをエクスポート。倍率や全ページ一括エクスポートも選択可能。
- **共有**：リンクを生成。プレビューリンクはサインイン不要、編集リンクはサインイン後に保存が必要。[エクスポートと共有](/features/export-share) を参照。

## 新規ユーザー向けのヒント

- 無料プランには毎日の Auto トライアルが含まれます。追加クォータはプランとカードキー交換を確認してください。
- 作業はクラウドに同期されます。エディターを離れるとドキュメントとカバーが自動保存されます。
- よく使うキー：Space でパン、スクロールホイールでズーム、**C** で Agent の切り替え、**A** で画像ジェネレーター。一覧は [ショートカット](/guide/shortcuts) を参照。
- 困ったときはまず [FAQ](/faq/) を確認。法務・プライバシーは [利用規約](/legal/terms) を参照。
`,Sa=`# 画像生成

recombyn では画像生成に 2 つの一般的な方法があります。**キャンバス上の Image ジェネレーターノード** と **Agent チャットの Image モード**。どちらも解像度、アスペクト比、枚数、モデル設定を共有します。

## Image ジェネレーターノード

1. 下部ツールバーの **Image generator** をクリック、または **A** を押します。
2. ジェネレーターカードがビューポート中央に表示されます。入力欄は **そのノード選択時のみ** 表示されます。
3. プロンプトを入力。**+** で参照画像をアップロード、または \`@\` で既存の添付ファイルを参照。
4. 設定チップをタップして調整：**解像度 · アスペクト比 · 枚数**（例：\`2K · 1:1 · 1 image\`）。
5. Image モデルを選び、クレジットを確認して送信。

成功するとノードは通常の画像ノードになります。複数枚生成した場合、余分な画像はその画像の **multi-image variants** に入り、メイン画像の切り替えや個別ノードへの分割が可能です。失敗時は「Image generation failed」または「No image returned」が表示される場合があります。新しいプロンプト / モデルで再試行してください。

### 一般的な設定

| 項目 | オプション |
|------|---------|
| 解像度 | SD 1K / HD 2K / UHD 4K |
| アスペクト比 | Auto、21:9、16:9、3:2、4:3、1:1、3:4、2:3、9:16 |
| 枚数 | 1–4 枚 |
| Smart aspect | モデルがコンテンツから比率を確定 |

送信ボタン横にクレジット消費が表示されます（稲妻アイコン + 数値）。モデルと枚数に基づきます。

## Agent **Image** モード

右チャット下部で 3 モードを切り替えます。

| モード | 説明 |
|------|-------------|
| **Agent** | キャンバスを直接編集：レイアウト、要素追加、画像差し替えなど |
| **Ask** | 回答 / 提案。操作プレビューを出し、**確認**後に適用 |
| **Image** | テキストから画像 / 参照から画像に特化。ジェネレーターノードと同様の操作 |

**Image** モードでは、シーンを記述し参照を添付してチャット内で生成し、キャンバスに配置します。ホームのブリーフでも画像シナリオを選んでフルデザインを開始できます。

## 参照と @

- **参照画像**：ローカルアップロード、またはチャットに貼り付け（Ctrl + V）。
- **@**：現在の会話内の添付ファイルから選択 — 「この参照から続ける」。
- **モデル**：入力欄下のモデルボタンで別途選択。\`@\` パネルでは選べません。

既存の画像を選択している場合、ツールバーの **Chat** で image-to-image 編集（[画像編集ツール](/guide/image-tools) を参照）。

## フルデザインフローとの関係

ホームからウェブサイト / モバイルアプリ / ポスターなどを開始する場合も次を選択できます。

- **実行モード**：Agent pipeline（スキルチェーン + Auto ルーティング）または single-model draw。
- **協調ペース**：human-in-the-loop / key milestones / fully automatic（[Agent の使い方](/guide/agent) を参照）。

純粋な画像生成には、ジェネレーターノードまたは Agent **Image** モードを推奨します。
`,Ca=`# 画像編集ツール

キャンバス上の **画像ノード** を選択すると、上部に画像ツールバーが表示されます。多くの AI 操作は確認前にクレジット消費を表示します。

## メインツールバー

| ツール | 用途 |
|------|---------|
| **Chat** | プロンプトベース編集（image-to-image）。参照、モデル、解像度を任意で指定 |
| **Upscale** | 超解像で **4K** または **8K** プリセット |
| **Remove background** | 切り抜き。「portrait / fine hair」または「product / hard edge」を選択 |
| **Eraser tool** | ブラシでマスク。確定すると該当ピクセルを削除 |
| **Multi-angle** | 視点を調整して再生成（下記） |
| **More …** | Expand、Adjust、Crop、Flip & rotate |
| Blend / opacity | Photoshop 風ブレンドモード |
| Corner radius | 対応箇所で角丸 |
| Export / fullscreen preview | 単一ノードのエクスポートまたは全画面表示 |

## More メニュー

| 操作 | 説明 |
|--------|-------------|
| **Expand** | アウトペイント / キャンバス拡張 — 背景や余白に適しています |
| **Adjust** | 明るさ、露出、コントラスト、ハイライト / シャドウ、白 / 黒ポイント。彩度、色温度、ティント。自動プリセット付き |
| **Crop** | キャンバス上でクロップボックスをドラッグ |
| **Flip & rotate** | 水平 / 垂直反転と角度 |

Crop と Expand はキャンバス上でセッション形式の編集を開き、確定するとノードに書き戻されます。

## Multi-angle

パネルは **skybox** / **camera** に分かれます。

- プリセット：正面、側面、逆アングル、3/4、俯瞰、ローアングルなど。
- スライダー：回転、チルト、ズーム（近 / 中 / 遠）
- **Apply now** はクレジット消費で生成し、現在の画像を置き換えます

## Chat クイック編集

1. 画像を選択 → **Chat**。
2. 変更内容を記述（例：「暖かい照明」「背景の不要物を削除」）。
3. 参照、モデル、枚数を任意で指定。現在の画像がメイン参照。
4. 生成中は「Editing…」を表示。結果はノードに書き込まれ（複数枚は variants に）。

AI 生成画像の場合、入力欄に元プロンプトが事前入力され、微調整に使えます。

## Multi-image variants

複数枚生成した場合、ノードに「N images」と表示されます。

- **View all**：すべての結果を展開
- **Set as main**：表示する 1 枚を選択
- **Separate node**：1 枚をキャンバス上に分割して独立編集

## 参照クレジット（ツール）

| ツール | おおよそのクレジット |
|------|-----------------|
| Remove background | 10 |
| Upscale | 20 |
| Adjust | 20 |
| Expand | 30 |
| Multi-angle | 30 |

テキストから画像 / image-to-image はモデルと枚数で別途課金 — ボタン横の数値を参照。画像ツールは**実行前課金**で、失敗時に自動返金されない場合があります。[FAQ](/faq/) と [アカウントとクレジット](/guide/account) を参照。

## Agent 関連機能

一部の操作は主に Agent ツール経由（例：画像内テキストを編集可能レイヤーに分割 **Edit text**）。自然言語で記述すればよく、ツールの入口を覚える必要はありません。
`,wa=`# Lottie

**Lottie ジェネレータ**または **Lottie JSON** のアップロードで再生可能な Lottie ノードになります。

> Lottie はアセット欄（画像 / 動画 / 音声）には入りません。キャンバスか JSON 書き出しで管理します。

## ジェネレータ

右クリック → **生成器 → Lottie 生成器**。説明と任意の参照画像、比率・尺・モデルを選んで生成。よくある既定は比率 \`1:1\`、尺 \`3\` 秒。

## JSON アップロード

ツールバーのアップロードやドロップ / 貼り付けの \`.json\` を Lottie として解釈。無効ならエラー表示。

## ツールバー

再生 / 一時停止、ループ、速度（\`0.5×–2×\` など）、JSON 置換、JSON ダウンロード。Lottie のみ選択時の書き出し形式は **JSON**。

## 関連

- [画像生成](/guide/image-generation) · [動画生成](/guide/video-generation) · [キャンバス](/guide/canvas)
`,Ta=`# ショートカット

エディター内のショートカットパネルで一覧を確認できます（Mac は ⌘、Windows / Linux は Ctrl）。以下はよく使う割り当てです。

## キャンバスナビゲーション

| 操作 | ショートカット |
|--------|----------|
| キャンバスをパン | Space + ドラッグ（またはハンドツール H） |
| 空白キャンバスをドラッグしてパン | 選択ツールで空白領域をドラッグ |
| スクロールホイールでズーム | スクロールホイール |
| 100% にズーム | Ctrl + 0 |
| ズームイン / アウト | Ctrl + + / Ctrl + - |
| 全コンテンツにフィット | Shift + 1 |
| プロジェクトを保存 | Ctrl + S |

## ツール切り替え

| 操作 | ショートカット |
|--------|----------|
| 選択 | V |
| ハンド（パン） | H |
| スマートアートボード | F |
| テキスト | T |
| ペン | P |
| ブラシ | Shift + P |
| 塗りつぶし | B |
| 矩形 | R |
| 線 | L |
| 矢印 | Shift + L |
| 楕円 | O |
| 画像アップロード | I |
| Image ジェネレーターノード | A |
| Agent パネルを開く / 閉じる | C |
| パス編集を終了 / パネルを閉じる | Esc |

## ノード編集

| 操作 | ショートカット |
|--------|----------|
| コピー / 切り取り / 貼り付け | Ctrl + C / X / V |
| 複製 | Ctrl + D |
| すべて選択（選択ツール使用時） | Ctrl + A |
| 元に戻す | Ctrl + Z |
| やり直し | Ctrl + Shift + Z（または Ctrl + Y） |
| 選択を削除 | Delete（Backspace はテキスト編集用） |

## レイヤー順

| 操作 | ショートカット |
|--------|----------|
| 最前面 / 最背面 | ] / [ |
| 1 レイヤー上 / 下 | Ctrl + ] / Ctrl + [ |
| 選択レイヤーの表示 / 非表示 | Ctrl + Shift + H |
| 選択レイヤーのロック / 解除 | Ctrl + Shift + K |

## チャット（Agent）

| 操作 | ショートカット |
|--------|----------|
| Agent を開く / 閉じる | C |
| @ で追加済み添付ファイルを選択 | @ |
| 画像またはコンテンツをチャットに貼り付け | Ctrl + V |
| キャンバス選択をチャットに追加 | Ctrl + Shift + L |
| メッセージを送信 | Enter |
| 改行を挿入 | Shift + Enter |
| 編集をキャンセル / パネルを閉じる | Esc |

## ヒント

- ペン / パス編集：**Enter** または **Esc** で完了。パス編集ツールバーで選択 / ペン / カーブを切り替えてから確定できる。
- インラインテキスト編集：**Esc** で終了。
- マルチ画像バリアントオーバーレイ、ショートカットパネル、その他のオーバーレイ：**Esc** で閉じる。
`,Ea=`# Skills

**Skills** は有効化できる能力パックです（公式または自分の \`.zip\`）。有効時に Agent / チャットが指示に従い、入力欄の **\`/\`** で**当ターンにピン**できます。

## ツールボックス

ホーム左レールの **Skills**。

| 区分 | 内容 |
|------|------|
| **公式** | プラットフォーム提供。不要なものはオフ可 |
| **自分** | アップロード分。有効化・説明プレビュー・削除 |

## アップロード

「自分」で **Upload skill** → \`.zip\`。**セキュリティ検査**通過後に一覧へ。同名は上書き更新可。

## チャットの \`/\`

Agent パネルで **\`/\`** → 検索して選択 → チップが当ターンに固定。\`@\` は添付、\`/\` は Skill。[Agent](/guide/agent) 参照。

## 関連

- [Agent](/guide/agent) · [はじめに](/guide/getting-started)
`,Da=`# 動画生成

**キャンバスの動画ジェネレータ**と、Agent の **Video** モードの 2 通りがあります。比率・解像度・尺・モデルはおおむね共通です。

## 動画ジェネレータ

1. キャンバス空白で右クリック → **生成器 → 動画生成器**（ツールバーの画像ジェネレータは画像のみ）。
2. 説明を入力し、**比率・解像度・尺**とモデルを選びます。
3. **+** / \`@\` で参照画像を付けられます。
4. 成功するとその場で**動画ノード**になります。

| 項目 | 目安（UI 準拠） |
|------|------------------|
| 比率 | 16:9（よくある既定）、9:16、1:1、4:3、3:4 |
| 解像度 | 480p、720p、1080p |
| 尺 | 約 4–15 秒（よくある既定 5 秒） |

プラットフォームモデルはクレジット消費。BYOK 動画は通常非消費（[カスタムモデル](/guide/custom-models)）。

## Agent Video モード

右チャットを **Video** に。結果は会話内の再生ギャラリーに出ます。キャンバスへは [アセット](/guide/assets) から動画をドラッグ。成功結果は通常アセットに保存されます。

## 動画ノード

トリム / クロップ、フレーム抽出、全画面 / ダウンロード。選択が動画のみのとき書き出しは **MP4** または音軌 **MP3**（[書き出しと共有](/features/export-share)）。

## 関連

- [画像生成](/guide/image-generation) · [アセット](/guide/assets) · [Agent](/guide/agent) · [キャンバス](/guide/canvas)
`,Oa=`# About us

**会話で、編集可能なデザインを。**

recombyn はデザイン Agent です。自然言語で目標を伝え、無限キャンバス上でポスターや UI、グラフィックを生成・調整し、編集可能な構造を残します。

## なにか

意図を分解し、レイアウトと素材を配置し、対話で反復します。手作業でのノード編集・差し替え・フォント調整もいつでも可能です。

## 個人開発

個人開発者が余暇に構築しています。会話駆動デザインを本当に使えるものにすることが目標です。

プロジェクトを続けやすくするために支援いただける場合は、[スポンサー](/sponsor)ページをご覧ください（任意です）。

## できること

参照や画像の取り込み、Auto またはモデル指定、会員の BYOK、Plaza 公開、プレビュー / 協働リンク、フル自動または重要点での確認。

## プランと課金

無料は日次 Auto 試用。有料は月次統一クレジットと追加能力。詳細は [アカウントとクレジット](/guide/account)。

## フィードバック

アカウント設定の**お知らせ**とフィードバック入口からご連絡ください。

## ホワイトラベル / なりすまし禁止

recombyn はソースアベイラブルです。個人利用と単一組織内デプロイは可。**許諾なしでは**見た目を変えて販売したり、一般向けホスティングとして提供したり、公式ブランド / サイト / サポートを装うことはできません。

- 公式: [recombyn.com](https://recombyn.com)
- ドキュメント: [はじめに](/guide/getting-started)
- ソース: [github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

模倣・無断ホスティングは \`702680355@qq.com\` へ（リンクとスクショ）。詳細はリポジトリの [LICENSE](https://github.com/recombyn/recombyn/blob/main/LICENSE)。

## リンク

- [創作を始める](https://recombyn.com)
- [はじめに](/guide/getting-started)
- [利用規約](/legal/terms)
- [プライバシー](/legal/privacy)
- [AI サービス説明](/legal/ai-terms)
`,ka=`# AI サービス説明

> 最終更新：2026年7月28日

[利用規約](/legal/terms) の補足です。操作は [Agent](/guide/agent)、[画像生成](/guide/image-generation)、[画像ツール](/guide/image-tools) を参照。

## 1. 対象範囲

対話型デザイン Agent、画像生成・編集、**Auto** とルーティング設定、会員向け **BYOK** 互換エンドポイントなど。実際の提供内容は製品内に準拠。

## 2. プラットフォームモデルと第三者モデル

**プラットフォーム**：プロンプト・参照・文脈が提供者に送られる場合があります。

**BYOK**：Key は通常ブラウザのみ。指定先のポリシーに従い、可用性・品質は保証しません。

## 3. Auto ルーティング

タスクのレーン判定後にモデルをマップ。画像生成は別スロットの場合があります。[Agent](/guide/agent#auto-ルーティング設定) 参照。

## 4. 出力と確認

不正確・不完全・偏りの可能性があります。正式利用前に確認してください。最終採用は自己責任です。

## 5. 禁止事項

違法・権利侵害・詐欺・憎悪・有害コンテンツの生成、セキュリティ / クォータ / 課金の回避、未許可キーの接続を禁止します。

## 6. 権利帰属

利用規約の「ユーザーコンテンツ」に従います。提供者はログを一定期間保持する場合があります。

## 7. クレジットと費用

プラットフォーム利用は統一クレジット消費の対象になり得ます。BYOK の画像 / 動画生成は通常非対象ですが、デザイン Agent はホールド対象になり得ます。提供者費用は自己負担。同一フローのプラットフォーム画像機能・画像ツールは課金対象。[アカウント](/guide/account) 参照。

## 8. 変更

モデル・ルーティング・クォータを変更する場合があります。重要変更は可能な限り通知します。
`,Aa=`# プライバシーポリシー

> 最終更新：2026年7月28日

> **recombyn** への入力に、本人または他人の機微な個人情報（身分証番号、正確な住所、金融口座、健康情報など）を含めないでください。

## 1. 収集する情報

サービス提供のため、次を収集する場合があります。

| 区分 | 例 |
|------|-----|
| **アカウント** | メール、表示名、自己紹介、アバター、ログイン方式（メール / Google） |
| **セッションとセキュリティ** | ログイン状態、認証関連記録、必要なセキュリティログ |
| **プロジェクト** | キャンバス文書、アップロード画像、カバー |
| **利用と課金** | クレジット残高・明細、プラン、カードキー交換結果 |
| **共有と協働** | 共有リンク設定、追加した共同編集者の識別子 |
| **Plaza** | 投稿メタデータとカバー、審査関連情報 |
| **プロダクト通信** | フィードバック、通知 / お知らせの既読状態 |
| **診断** | API エラー、性能・不正利用防止ログ |

Google 等の第三者ログインでは、許可範囲の基本プロフィールを受け取ります。

## 2. 利用目的

アカウント維持、デザインの保存・描画、AI 支援、課金、共有 / Plaza、セキュリティ、お知らせ、製品改善。

## 3. 端末ローカル保存

次は**端末のみ**に保存されることが多く、例：

- **サードパーティ API Key** とカスタムプロバイダ設定（BYOK）
- **Auto ルーティング設定**
- 言語・テーマ等の UI 設定

サイトデータを消すとこれらは失われます。共有 PC に機密 Key を残さないでください。

## 4. 保存とセキュリティ

クラウド上のサーバ / DB / オブジェクトストレージに保存する場合があります。合理的な保護を行いますが、絶対の安全は保証できません。

## 5. 第三者サービス

クラウド、プラットフォーム LLM、ログイン、決済 / カードキー等に依存する場合があります。

- **プラットフォームモデル**：プロンプト・参照画像・文脈が提供者に送られ、そのポリシーに従います。
- **BYOK エンドポイント**：あなたが指定した提供者へ送信されます。信頼できる端点のみ追加してください。

## 6. Plaza・共有・協働

Plaza 公開や共有リンク / 招待により、他ユーザーやリンク保持者に見える場合があります。プレビューは未ログインで閲覧できることがあります。

## 7. Cookie 等

ログイン、言語、テーマ、ルーティング設定などに Cookie / localStorage を使います。

## 8. あなたの選択

プロフィール更新、共有権限管理、ローカル設定削除、またはアカウント関連の問い合わせが可能です。法令の範囲で開示・訂正・削除を求められる場合があります。

## 9. 未成年

主に完全な行為能力のある利用者向けです。法定年齢未満の場合は保護者の同意と指導の下で利用してください。

## 10. 更新

本ポリシーを更新する場合があります。重要な変更は製品内またはお知らせで可能な限り通知します。

## 11. 連絡先

[About us](/legal/about) を参照。
`,ja=`# 利用規約

> 最終更新：2026年7月28日

recombyn（「本サービス」）へようこそ。利用により本規約に同意したものとみなします。同意しない場合は利用を中止してください。

## 1. 同意

本規約は [プライバシーポリシー](/legal/privacy) および [AI サービス説明](/legal/ai-terms) と併せて適用される場合があります。ヘルプと本規約が矛盾する場合は本規約が優先します。

## 2. サービス内容

無限キャンバス、Agent / Ask / Image、画像生成・編集、Auto ルーティング、BYOK 互換モデル、インポート、エクスポートと共有協働、Plaza など。機能は変更されることがあります。

## 3. アカウントと安全

認証情報とログイン行為に責任を負います。端末に保存した第三者 API Key は自己管理とし、漏洩による提供者側費用等は自己負担とします。

## 4. ユーザーコンテンツ

アップロード・作成・公開した内容はあなたに帰属します。サービス提供に必要な範囲の限定的な処理・表示ライセンスを付与します。

## 5. 適正利用

違法行為、権利侵害、課金・クォータ回避、システム攻撃、有害な AI 生成等を禁止します。違反アカウントを制限・停止できる場合があります。

## 6. クレジット・プラン・カードキー

プラットフォームの対話 / Agent / 画像等は**統一クレジット**を消費する場合があります。BYOK の画像 / 動画生成は通常非対象ですが、デザイン Agent 等は対象になり得ます。提供者への費用は自己負担です。カードキー交換は原則返金不可（法令等を除く）。詳細は [アカウントとクレジット](/guide/account)。

## 7. 共有と協働

プレビュー / 編集リンクと共同編集者招待が可能です。公開範囲は自己責任で管理してください。

## 8. 免責

「現状有姿」で提供します。中断、データ損失、第三者モデルの誤り、接続先の可用性等を保証しません。AI 出力は不正確な場合があります。セッションのチェックポイントは再読み込み後に無効になることがあります。

## 9. 責任制限

法令が許す最大限の範囲で、間接損害等について責任を負いません。有料関連の上限は当該紛争につき支払済み金額までとします。

## 10. 変更

更新後の継続利用は改定への同意とみなします。重要変更は可能な限り通知します。

## 11. 連絡先

[About us](/legal/about) またはカードキー購入時の連絡先。
`,Ma=`# 常见问题

## 登录与账户

**收不到验证码？**  
检查垃圾邮件；确认邮箱拼写；等待冷却时间后再试。

**Google 登录失败？**  
确认浏览器允许弹窗 / 第三方 Cookie；或改用邮箱登录。

## 积分与计费

**为什么看不到余额 / 方案 / 卡密？发送旁也没有积分数字？**  
桌面**本地版**与多数**自托管**部署默认关闭平台积分（\`WALLET_BILLING_ENABLED=false\`），相关入口与预计消耗会一并隐藏，也不会因平台余额拦截。需要 SaaS 式钱包时由部署方显式开启。见 [账户与积分](/guide/account#何时看不到积分--方案)。

**自托管提示「Token / 积分不足」？**  
先确认 API 是否误开了 \`WALLET_BILLING_ENABLED=true\`；默认应为关闭。关闭后重启 API，前端会隐藏积分 UI 且不再扣平台积分。本地版始终不走平台钱包。

**为什么扣了积分但没结果？**  
（仅平台积分开启时）设计 Agent 预扣多数情况会在失败时退回；**图片工具**多为先扣再执行，失败不一定自动退。请保留时间点，在账户「用量与账单」核对，并在产品内反馈。

**免费额度用完了？**  
免费档每天约 **1 次**设计试用（通常强制 Auto）；用完可等次日重置，或升级方案 / 兑换卡密。

**图片工具扣多少分？**  
去背景、放大、调整、扩展、多角度等有固定参考消耗；文生图按模型与张数计费。详见 [图片编辑工具](/guide/image-tools) 与按钮旁数字。

**第三方模型扣平台积分吗？**  
**BYOK 图片 / 视频生成**一般不扣平台积分；**设计 Agent 改画布**即使选用第三方模型，仍可能预扣 / 结算积分。详见 [自定义与第三方模型](/guide/custom-models) 与 [账户与积分](/guide/account)。


**账单在哪里看？**  
账户 → 用量与账单（或同类入口），含充值与消耗记录。详见 [账户与积分](/guide/account)。

## 画布与同步

**首页封面不是最新稿？**  
离开编辑器时会强制同步文档与封面；硬刷新首页。若仍旧，在画布再改一笔保存后返回。

**刷新后画布内容丢了？**  
登录态下以云端为准；确认已登录且网络正常。本地草稿会尽量保留未同步编辑。

**图层面板看不到画板？**  
画板与形状 / 图片等节点会一起出现在图层面板；可显隐、锁定并调整叠放。新建画板默认在栈顶。见 [画布与工具](/guide/canvas)。

**删除「上传中」的图片 / 视频后，撤销又回来了？**  
上传占位被删除时会中止上传，且该删除不可撤销（Ctrl+Z 不会恢复占位）。若刷新后又出现，多半是云端尚未同步到删除结果，稍候再刷新或确认网络后重试。见 [画布与工具 · 视频](/guide/canvas#视频)。

## Agent 与出图

**自动 / 询问 / 图片 / 视频有什么区别？**  
自动直接改画布；询问先答 / 出方案，需要改画布时给出操作预览，点「确认」后才落地；图片专注生图；视频专注视频生成。长任务可暂停与继续生成。见 [Agent 用法](/guide/agent)。

**检查点撤销后刷新又回来了 / 提示快照失效？**  
部分检查点仅当前会话有效，刷新后可能失效。重要结果请及时「保留」或导出。见 [Agent 用法 · 检查点](/guide/agent#检查点与还原)。

**Auto 选的模型不对？**  
在账户 → Agent（或模型弹层里的 Auto 路由）调整标准版 / Pro / Max，或改用**自定义车道**为轻量 / 标准 / 推理 / 多模态 / 生图分别指定模型；也可手动锁定某个模型。车道含义与后端如何分派见 [Agent 用法 · Auto 路由](/guide/agent#auto-路由偏好)。

**自定义车道会一次调用五个模型吗？**  
不会。每轮只走一条车道（或另加生图步骤）。五个槽位是「任务类型 → 模型」的配置表。

**怎么添加第三方大模型？**  
账户 → Agent → 第三方模型：可选**平台目录**（如 OpenRouter，通常只需 API Key）或**手动填写**（模型 ID、请求地址、类型含对话 / 多模态 / 图片 / 视频）。网页一般需标准档及以上。详见 [自定义与第三方模型](/guide/custom-models)。

**桌面本地版没有平台模型 / 怎么打包？**  
本地版不展示平台 LLM 目录，需自备 Key；安装包与 EXE 输出路径见 [桌面端](/guide/desktop)。

**生图很慢或失败？**  
检查积分、网络与所选模型状态；换模型或降低分辨率 / 张数重试。生成器节点失败时可看提示「未返回图片」后重试。

**多张图生成后怎么切换？**  
选中图片节点展开「N 张图」，可设为主图或单独成节点。见 [图片编辑工具](/guide/image-tools)。

## 广场、导入与分享

**发布到广场一直未展示？**  
需管理员审核；未通过时按反馈修改后重提。见 [广场与灵感](/features/plaza)。

**导入后排版乱？**  
导入图片后建议再调画板尺寸与图层，或让 Agent 统一整理。见 [导入文件](/features/import)。

**分享链接别人改不了？**  
「仅预览」本来就不能改。「可编辑」需要对方登录，且已被你邀请为协作者（或为所有者）。见 [导出与分享](/features/export-share)。

## 还有问题？

见 [关于我们](/legal/about) 中的反馈方式；功能以产品内实际界面为准。快捷键见 [快捷键](/guide/shortcuts)。
`,Na=`# 导出与分享

## 导出

编辑器顶部 **导出** 菜单常见项：

| 入口 | 说明 |
|------|------|
| **导出全部页面** | 多画板时导出各页 |
| **导出选中** | 当前选区或当前画板内容（以界面为准） |
| **导出 JSON** | 导出项目文档结构，便于备份或再导入 |

### 格式与选项

打开导出面板后：

| 情况 | 可选格式 |
|------|----------|
| 普通画板 / 图形内容 | **PNG** / **JPG** / **SVG** |
| **仅选中视频** | **MP4**，或抽音轨为 **MP3** |
| **仅选中 Lottie** | **JSON**（Lottie） |

- 倍率：约 \`0.5x–4x\`（SVG 通常固定 1x）
- JPG 可开**导出时压缩**以减小体积
- 可设文件名前缀 / 后缀

单节点也可在选中后从工具条导出或全屏预览。下载后可用于投放、印刷或二次设计。多画板请确认导出范围。

更多媒体能力见 [视频生成](/guide/video-generation)、[音频](/guide/audio)、[Lottie](/guide/lottie)。

## 分享链接

**Share** 可生成链接（开启后可复制发给他人）：

| 类型 | 说明 |
|------|------|
| **仅预览** | 持有链接者可查看，**无需登录** |
| **可编辑** | 打开后需登录；仅**所有者与受邀协作者**可改稿并保存 |

未开启公开链接时，通常仅文件协作者可访问该文件（以界面开关文案为准）。请勿在公开预览链接中放置敏感信息。

## 邀请协作者

在分享面板中可按**用户名 / 邮箱 / 用户 ID** 邀请协作：

1. 打开 **Share** → 邀请协作。
2. 搜索并添加对方。
3. 对方登录后即可在授权范围内打开并编辑。

可在协作者列表中管理已邀请成员。

## 实时协作：跟随视口

多人同时编辑时，顶部会出现协作者头像条（与分享对话框分开）：

- 点击某位协作者头像：**跟随**其视口（平移 / 缩放与对方对齐）
- 再点一次，或自行平移 / 缩放：停止跟随

文案类似「跟随某某」「正在跟随」「停止跟随」。

## 发布到广场

将作品 **发布到广场** 后需管理员审核通过才会公开展示。封面与画板要求见 [广场与灵感](/features/plaza)。
`,Pa=`# 导入文件

首页支持将**本地图片**导入为可编辑画布内容。

> 当前产品**不提供** PDF / Word（DOCX）导入。若界面或旧文档仍提到 PDF / Word，以本页为准。

## 支持类型

| 类型 | 说明 |
|------|------|
| **图片** | 导入为图片节点，可继续用 [图片编辑工具](/guide/image-tools) 与 Agent |

常见格式：PNG、JPG、WEBP、GIF 等；扩展名与大小限制以产品上传提示为准。

## 建议流程

1. 在首页选择导入，或把图片拖入导入区（若界面支持）。
2. 等待上传完成并进入编辑器。
3. **检查画板尺寸**是否符合目标场景（海报 / 手机 / 网页等）。
4. 在 [图层面板](/guide/canvas#图层) 理清顺序，隐藏不需要的层。
5. 用 Agent 统一风格、改文案或替换配图；局部也可用手动工具精修。

## 注意

- 导入后的项目同样会走云同步与导出 / 分享流程。
`,Fa=`# 功能概览

## 画布工作区

无限画布、多智能画板、矢量 / 位图混排；支持选择、形状、钢笔、画笔（含橡皮）、油漆桶、文字、图片 / 视频上传与图像生成器节点。视频可选中后剪辑、裁剪、提取帧等。图层面板同时管理画板与节点（显隐、锁定、叠放）；多选可对齐与分布。详见 [画布与工具](/guide/canvas)。

## 对话模式

Agent 面板支持 **自动**（改画布）、**询问**（先答后确认）、**图片**、**视频**。支持检查点撤销 / 保留与「撤销到此步骤」；长任务可暂停与继续生成。Auto 可设标准 / Pro / Max / 自定义车道。见 [Agent 用法](/guide/agent)。


## 自定义与第三方模型

账户 → Agent 可添加自有 Key：平台目录（OpenRouter、火山方舟等）或手动兼容端点；类型含对话 / 多模态 / 图片 / 视频。详见 [自定义与第三方模型](/guide/custom-models)。

## 桌面端

提供 Local（本机 SQLite + 边车 API）与 Cloud 两种桌面构建；含开发命令与打包产物路径。见 [桌面端](/guide/desktop)。

## 媒体生成、资产与编辑

- **图片**：生成器（**A**）或 Agent「图片」；见 [图片生成](/guide/image-generation)。
- **视频 / 音频 / Lottie**：画布右键「生成器」；Agent 另有「视频」模式。见 [视频](/guide/video-generation)、[音频](/guide/audio)、[Lottie](/guide/lottie)。
- **资产**：左侧栏汇总 AI 生成的图片 / 视频 / 音频，可拖回画布。见 [资产](/guide/assets)。
- **技能**：首页「技能」工具箱 + Chat \`/\`。见 [技能](/guide/skills)。
- 图编辑：去背景、放大、扩展等。见 [图片编辑工具](/guide/image-tools)。



## 导入文件

图片可导入为可编辑内容。详见 [导入文件](/features/import)。

## 灵感与广场

浏览官方 / 社区案例，一键打开到编辑器；可将作品提交广场审核。见 [广场与灵感](/features/plaza)。

## 云同步与账户

登录后项目文档与封面自动同步；多端以云端为准。Ctrl + S 可手动保存。账户含方案、积分、账单、卡密、通知公告与 Agent 偏好。见 [账户与积分](/guide/account)。

## 导出与分享

导出常见图片格式（含倍率、全部页面）；分享链接支持预览或协作编辑，并可邀请协作者。详见 [导出与分享](/features/export-share)。
`,Ia=`# 广场与灵感

广场用于浏览**官方案例**与社区作品，并一键打开到自己的编辑器继续改。

## 浏览

- 首页与广场入口可看 **推荐 / 最新 / 我的关注** 等（以产品标签为准）。
- 品类大致包括：网站、移动应用、图片、**视频**、海报、绘画等。
- **官方案例**：由平台提供的高质量模板 / 示例，适合当作起点。
- 打开案例后会复制到你自己的项目；节点可继续手改或交给 Agent。

## 灵感详情常用动作

打开某条灵感 / 作品后（以界面为准）：

| 动作 | 说明 |
|------|------|
| **做同款** | 复制到自己的项目并进入编辑器 |
| **使用提示词 / 图片** | 把案例中的提示或素材带到创作流程 |
| **喜欢** | 加入「我的喜欢」 |
| **关注创作者** | 便于在关注流中看到更新 |
| **分享** | 分享该灵感链接（若已开放） |

## 发布到广场

在编辑器中可将当前作品 **发布到广场**：

1. 准备好**封面画板**（导出与预览会优先用合适的画板；多画板时选代表性一页，比例尽量符合封面要求）。
2. 填写标题等信息并提交。
3. 需 **管理员审核通过** 后才会公开展示。

请勿发布侵权、敏感或违反 [服务条款](/legal/terms) 的内容。审核未通过时可按反馈修改后重提。

## 个人主页

登录后可在个人页查看：

| 分区 | 说明 |
|------|------|
| **已发布** | 你提交且审核通过的广场作品 |
| **我的喜欢** | 你点赞过的内容 |
| **资产** | 与编辑器 [资产](/guide/assets) 相关的入口（以产品为准） |

个人主页与编辑器内的项目库相互独立。个人主页「分享」若显示即将开放，以产品内为准。
`,La=`# 账户与积分

## 打开账户

登录后，通过头像 / 账户入口打开设置。常见分区：

| 分区 | 内容 |
|------|------|
| **个人资料** | 显示名、简介、头像 |
| **方案** | 会员档位、权益对比、升级 |
| **积分 / 钱包** | 余额、预计消耗提示 |
| **用量与账单** | 充值与模型消耗流水 |
| **卡密兑换** | 会员套餐或积分充值 |
| **Agent** | Auto 路由偏好、第三方模型 |

具体入口文案以产品界面为准。

## 统一积分

钱包里只有一种货币：**积分**（对话、Agent、出图、图片工具等共用，以流水为准）。

常见扣费方式（云端 / 网页）：

| 能力 | 大致规则 |
|------|----------|
| **设计 Agent（自动改画布等）** | 先预扣一笔，再按实际用量结算；失败时预扣多数情况会退回 |
| **部分聊天接口** | 可能按次固定扣费（与提示长短无关） |
| **文生图 / 视频生成（平台模型）** | 按模型、张数 / 规格扣费；按钮旁常有预计消耗 |
| **图片工具**（去背景、放大、扩展、多角度等） | 按次固定参考价，**先扣再执行**；失败时当前实现**不一定自动退回** |
| **BYOK 图片 / 视频生成** | 一般**不扣**平台积分（走你自己的 Key） |
| **BYOK + 设计 Agent** | 上游用你的 Key，但平台侧仍可能预扣 / 结算积分 |

会员每月赠送统一额度。余额不足时，发送或出图可能被拦截；可升级方案、兑换卡密，或等待免费档每日试用重置。

第三方说明见 [自定义与第三方模型](/guide/custom-models)。

## 何时看不到积分 / 方案

以下场景**不开启平台积分**，界面会隐藏余额、方案、卡密、用量账单，以及发送旁的预计消耗；服务端也不做预扣 / 扣费：

| 场景 | 说明 |
|------|------|
| **桌面本地版** | 始终关闭平台钱包（\`DESKTOP_LOCAL_AUTO_LOGIN\`） |
| **自托管 / 私有部署** | API 环境变量 **\`WALLET_BILLING_ENABLED\` 默认 \`false\`**；需要 SaaS 式计费时再显式设为 \`true\` |
| **Recombyn Cloud / 网页正式环境** | 运营侧开启积分后，才显示本页所述方案与钱包 |

未开启时请配置自有模型 Key，上游费用走你的供应商；不会出现「Token / 积分不足」一类平台钱包拦截。详见 [桌面端](/guide/desktop)。

## 会员方案

| 档位 | 大致定位（以产品内方案页为准） |
|------|--------------------------------|
| **免费** | 不赠月度积分；每天约 **1 次**设计执行试用（通常强制 Auto；以产品为准） |
| **标准（Plus）** | 每月赠送积分；可自选平台模型；可添加第三方模型 |
| **专业（Pro）** | 更高月度积分；第三方模型与更深能力 |
| **旗舰（Ultra，若上架）** | 最高额度与优先体验 |

卡片上的「约合 N 次对话 / N 张图」为按常用模型的**估算**，实际因模型单价与任务而异。

### 方案切换注意

- 付费方案在有效期内通常**不可切换到其他方案**；到期后可再换。
- 同档续期或**积分卡密**仍可兑换（以兑换提示为准）。

## 用量与账单

在账户的 **用量与账单**（或同类入口）可查看充值 / 赠送与消耗记录。

若扣了积分却没有结果：设计 Agent 预扣多数会退回；**图片工具**当前多为先扣费，失败不一定自动退——请保留时间点并在产品内反馈。

## 卡密兑换

1. 打开兑换入口，输入卡密（格式多为 \`XXXXX-XXXXX-XXXXX-XXXXX\`）。
2. 支持两类常见卡密：
   - **会员套餐**：开通对应方案，并到账月度积分赠送
   - **积分充值**：直接增加积分余额
3. 兑换成功后立即生效。除法律法规要求或产品明确承诺外，通常不支持无理由退款。

也可通过「购买卡密」等外链渠道获取卡密（以产品展示为准）。

## Agent 偏好（账户 → Agent）

与编辑器内 Auto 弹层共用同一套配置。

### Auto 路由

| 偏好 | 作用 |
|------|------|
| 标准版 | 跟随平台默认车道表 |
| Pro / Max | 使用更强的预设车道→模型映射 |
| 自定义车道 | 分别为轻量 / 标准 / 推理 / 多模态 / 生图指定模型 |

**仅聊天模型为 Auto 时生效。** 详见 [Agent 用法 · Auto 路由偏好](/guide/agent#auto-路由偏好)。

### 第三方模型

支持**平台目录**与**手动填写**。登录网页时 Key 可能加密保存在账户保险箱；详见 [自定义与第三方模型](/guide/custom-models)。网页需标准档及以上；桌面本地版见 [桌面端](/guide/desktop)。

## 个人资料

- 可修改显示名、简介与头像（头像上传至对象存储，不以 base64 长期存库）。
- 登录方式：邮箱或 Google（以你注册时为准）。
- 邮箱账号可在设置中**修改密码**；纯 Google 登录账号通常没有邮箱密码可改。

## 通知公告

账户设置中的 **通知公告**（或消息中心）可查看公告与系统通知，可标记全部已读。

## 相关文档

- [Agent 用法](/guide/agent)
- [自定义与第三方模型](/guide/custom-models)
- [桌面端](/guide/desktop)
- [图片生成](/guide/image-generation)
- [图片编辑工具](/guide/image-tools)
- [导出与分享](/features/export-share)
- [常见问题](/faq/)
`,Ra=`# Agent 用法

右侧对话区是 recombyn 的设计 Agent：理解需求、改画布、出图与迭代。按 **C** 打开 / 关闭面板；**Ctrl + Shift + L** 可将画布选中内容加入对话。

## 交互模式

对话输入区可切换（文案以产品为准）：

| 模式 | 常见标签 | 行为 |
|------|----------|------|
| **自动** | 自动 / 自动执行 | 直接修改画布（排版、加元素、换色换图等） |
| **询问** | 询问执行 | 先回答 / 出方案；需要改画布时给出可确认的操作预览，点「确认」后才落地 |
| **图片** | 图片生成 | 专注文生图 / 参考图生图，可调分辨率、比例、张数与模型 |
| **视频** | 视频生成 | 专注视频生成；设置与画布 [视频生成器](/guide/video-generation) 类似；结果在对话中预览，并可写入 [资产](/guide/assets) 再拖到画布 |

发送后可随时**停止**。长任务支持**暂停**与**继续生成**（断点续跑）；刷新后若会话已同步，询问模式下的待确认操作一般仍可点确认。

输入 **\`/\`** 可为当前回合固定 [Skill](/guide/skills)；**\`@\`** 用于附件引用。


## 检查点与还原

Agent 改画布后，对话里会出现**检查点**（版本快照）：

| 操作 | 说明 |
|------|------|
| **撤销** | 丢掉本轮画布改动，回到改前 |
| **保留** | 确认本轮结果 |
| **查看** | 预览该检查点对应状态（以界面为准） |
| **撤销到此步骤** | 在历史轮次上，把画布恢复到该检查点对应状态 |

注意：部分检查点在**刷新页面后可能失效**（界面会提示「快照已失效」）。重要结果请及时保留或导出。

## 活动日志

运行中可在活动区看到：思考、查技能 / 规则 / 知识 / 美学、画布尺寸、工具调用、出图步骤等，便于判断卡在哪一步。

## 附件与 @ 引用

先用 **+** 上传图片，或在对话里用 **Ctrl + V** 粘贴。输入 \`@\` 可搜索并引用**当前对话中已添加的附件**，便于明确「按这张参考图做」。

当前 \`@\` 面板不提供模型、项目或画布节点搜索。模型请通过输入框下方的模型按钮选择；画布选中内容可用 **Ctrl + Shift + L** 添加到对话。

## 模型选择：Auto 与手动锁定

点输入框下方的**模型按钮**打开列表，常见分区为 **设计** / **图片** / **视频**。

| 选择方式 | 行为 |
|----------|------|
| **Auto** | 系统按本轮任务选「车道」，再映射到对应模型（见下方） |
| **指定平台模型** | 本轮（及后续在未改回 Auto 前）锁定该模型；Auto 车道配置被覆盖为同一模型 |
| **第三方自定义模型** | 走自有 Key 与端点；**图片 / 视频生成**一般不扣平台积分，**设计 Agent 改画布**仍可能预扣平台积分（见 [自定义与第三方模型](/guide/custom-models)） |

免费档通常仅可使用 **Auto**（每天约 1 次设计试用，以产品为准）；标准档及以上可自选平台模型。桌面**本地版**没有平台模型目录，需自行配置第三方 Key，见 [桌面端](/guide/desktop)。

生图模型列表包含豆包 Seedream、GPT Image、Nano Banana Pro / Nano Banana 2 等（以产品内实际列表为准）。出图细节见 [图片生成](/guide/image-generation)。

## Auto 路由偏好

**仅当聊天模型为 Auto 时生效。** 可在两处设置（同源配置，保存在本机）：

1. **账户设置 → Agent**（完整表单）
2. Agent / 询问模式下模型弹层里的 **Auto 路由** 卡片（紧凑版）

### 偏好方案

| 偏好 | 说明 |
|------|------|
| **标准版（Standard）** | 平台默认车道表；偏国内 Seed / DeepSeek / Seedream 等 |
| **Pro** | 更强推理与看图的车道表 |
| **Max** | 旗舰档，优先高质量推理与指令遵循 |
| **自定义车道（Custom lanes）** | 你为每个车道单独指定模型 |

选择 Pro / Max / 自定义后，发送请求时会把车道→模型映射作为 \`route_overrides\` 发给后端；选标准版则跟随平台 Admin 默认表。

### 五个车道（自定义时逐项配置）

这不是「一次选中就立刻跑这个模型」，而是 **任务类型 → 模型** 的地图。五个槽位不会同时调用。

| 车道 | 含义 | 典型场景 |
|------|------|----------|
| **轻量（Fast lane）** | 短问答、小改、不重做版面 | 「把标题改红」「问一句能不能…」 |
| **标准（Standard lane）** | 常规画布编辑、中等改稿 | 调布局、换配色、改海报局部 |
| **推理（Reasoning lane）** | 空白从零、多画板、设计系统、长/难多步 | 「从零做整站」「多画板设计系统」 |
| **多模态（Multimodal）** | 需要看懂附件 / 参考图 | 带图问风格、按截图仿制 |
| **生图（Image model）** | 文生图模型槽（非聊天车道） | Agent 流水线需要 AI 出图时 |

价格档标签（如 Cheap / Moderate / Costly）仅作参考；实际是否调用取决于本轮被分到哪条车道。

### 后端如何判断执行（摘要）

1. 前端在 Auto 下附带你的车道配置（或 Pro / Max 预设映射）。
2. 后端先**判定本轮车道**（廉价路由器结构化输出；失败则用启发式）：
   - 有图且需要理解参考 → **多模态**
   - 空白画布 / 长提示 / 从零创建类 → **推理**
   - 短编辑、已有内容 → **轻量**
   - 询问（Ask）且无图 → 倾向 **轻量**
   - 其余 → **标准**
3. 再按车道查表得到具体模型 ID；若本轮有图但当前模型不支持看图，会软切到**多模态**槽位模型。
4. 需要文生图时，走**生图**槽位（与聊天车道分开）；平台生图按张扣积分，BYOK 生图一般不扣平台积分。
5. 失败重试可走平台配置的 fallback 链；重试次数由平台限制。


手动锁模时：前后端把轻量 / 标准 / 推理 / 多模态都钉到同一模型（生图仍可按图片模式或生图槽处理）。

## 第三方大模型（自有 Key）

可在 **账户 → Agent → 第三方模型** 接入自有 Key：

- **平台目录**：如 OpenRouter、火山方舟等，通常只需填 API Key，即可解锁目录里已接入的模型。
- **手动填写**：自定义供应商名称、模型 ID、请求地址；类型支持对话 / 多模态 / 图片 / 视频。

网页与云端桌面一般需标准档及以上；**桌面本地版**不强制会员，但没有平台模型列表，需要自己配 Key。

字段说明、计费拆分、排错见独立文档：**[自定义与第三方模型](/guide/custom-models)**。桌面安装与打包路径见 **[桌面端](/guide/desktop)**。

## 技能（Skills）

首页侧栏 **技能** 可管理官方 / 个人 Skill（上传 \`.zip\`、启用开关）。对话里输入 \`/\` 可为本回合固定 Skill。详见 **[技能](/guide/skills)**。

## 完整设计流程（首页 / 开稿）


从首页或 Agent 发起整页设计时，还可选：

### 运行方式

| 方式 | 说明 |
|------|------|
| **Agent 流水线** | 技能链协作，后端按任务路由模型 |
| **单模型绘图** | 直接用指定模型出图，不走完整技能流水线 |

### 协作节奏

| 节奏 | 说明 |
|------|------|
| **人际协同** | 每阶段停下确认（默认） |
| **关键节点确认** | 只在重要里程碑暂停 |
| **完全自动** | 一口气做完（仍可随时停止） |

场景类型包括网站、移动应用、图像、海报 / Banner 等，会影响画板预设与提示策略。

## 会话与活动

- 支持**新对话**与**历史对话**（数量有上限，以产品内为准）。
- 免费档每日有 Auto 试用；模型手动选择可能受档位限制。

## 积分与账单

在 **Cloud / 已开启平台积分** 的环境，对话、Agent 与出图共用统一积分；余额、流水、方案与卡密见 [账户与积分](/guide/account)。

桌面本地版与默认自托管关闭平台积分时，不显示余额与预计消耗，也不做平台预扣。
`,za=`# 资产

编辑器左侧的**资产**栏，用来集中查看本账号下由 AI **生成并保存**的媒体（图片、视频等），方便再次拖到画布使用。

入口：底部工具栏（或左侧区域）的**资产**图标；打开后可拖拽调整栏宽。

## 会出现什么？

| 类型 | 说明 |
|------|------|
| **图片** | 文生图 / 图生图等生成成功后入库的结果 |
| **视频** | 视频生成器或 Agent「视频」等成功后的结果 |
| **音频** | 音频生成 / 相关链路入库的结果 |

资产来自生成流程的自动归档，不是本地上传库。用图像 / 视频 / 音频生成器或 Agent「图片 / 视频」模式等完成生成后，一般会出现在列表里；空状态会提示「暂无 AI 生成资产…」。

**Lottie** 动画节点不会进入资产栏（见 [Lottie](/guide/lottie)）。本地手动上传到画布的文件，也不会自动进资产栏。


## 怎么用？

1. 打开资产栏，必要时点**刷新**拉取最新列表。
2. **点击**缩略图可预览（图片 / 视频等，以界面为准）。
3. **拖到画布**即可放置，路径与从对话拖图到画布类似。
4. 悬停条目可**删除**；删除后从账户资产列表移除（请谨慎操作）。
5. 列表支持分页**加载更多**。

资产栏只负责浏览与复用；改图、去背景等仍在选中画布节点后使用 [图片编辑工具](/guide/image-tools)。

## 与画布、图层的区别

| | 资产栏 | 画布 / 图层 |
|--|--------|-------------|
| 内容 | 账户级生成结果库 | 当前项目文档里的节点 |
| 放到画布 | 拖入后成为新节点 | 已在文档中 |
| 删除资产 | 从资产库去掉该条 | 不等于删除画布上已放置的副本（已放到画布的节点需在画布上另删） |

## 相关文档

- [图片生成](/guide/image-generation)
- [视频生成](/guide/video-generation)
- [音频](/guide/audio)
- [画布与工具](/guide/canvas)
- [Agent 用法](/guide/agent)
- [图片编辑工具](/guide/image-tools)

`,Ba=`# 音频

可在画布上放置**音频生成器**（文生语音 TTS，或直接上传本地音频），并对音频节点做截取、变速。生成结果会出现在左侧 [资产](/guide/assets) 栏，可再拖回画布。

## 音频生成器

1. 画布空白处**右键 → 生成器 → 音频生成器**。
2. 选中节点后：
   - **TTS**：输入要朗读的文案，选择可用的语音模型，点**生成**；
   - **上传**：点**上传音频**（或 \`@\` 引用资产里的音频）后生成，可跳过 TTS，直接落成音频节点。
3. 成功后节点原位变成**音频节点**。

常见上传格式：\`mp3\` / \`wav\` / \`ogg\` / \`m4a\` / \`aac\` / \`flac\` 等。TTS 输出多为 MP3（以实际上游为准）。发送旁可能显示预计积分；平台语音模型按规则扣积分，自有 Key 规则见 [自定义与第三方模型](/guide/custom-models) 与 [账户与积分](/guide/account)。

工具栏**上传文件**或拖放 \`audio/*\` 到画布，也可直接创建音频节点。

## 音频节点编辑

选中音频后，工具条主要两项（均会生成**副本**，不改原节点）：

| 操作 | 说明 |
|------|------|
| **截取** | 选定区间后确认，在旁生成「截取音频」；区间过短会提示 |
| **变速** | 约 \`0.1×–4×\`，确认后生成「变速音频」 |

## 与导出的关系

顶栏「导出选中」在**仅选中视频**时可导出 **MP3**（抽音轨）。纯音频节点的专用导出以产品界面为准；日常复用优先走资产栏拖放。

## 相关文档

- [视频生成](/guide/video-generation)
- [资产](/guide/assets)
- [画布与工具](/guide/canvas)
- [导出与分享](/features/export-share)
`,Va=`# 画布与工具

无限画布支持多个**智能画板**；底部工具栏切换工具，选中对象后会出现对齐、样式、填充等上下文操作。按 **C** 打开 / 关闭右侧 Agent；完整快捷键见 [快捷键](/guide/shortcuts)。

## 工具栏

| 工具 | 快捷键 | 说明 |
|------|--------|------|
| 选择 | V | 点选、框选；空画布拖拽可平移 |
| 移动（手型） | H | 拖拽平移；也可按住 Space |
| 形状 | R / L / O 等 | 矩形、线、箭头、椭圆、多边形、星形 |
| 钢笔 | P | 锚点路径；Esc / Enter 结束 |
| 画笔 | Shift + P | 自由绘制；工具条可开**橡皮**；支持笔刷库与自定义戳章 |
| 油漆桶 | B | 点击形状，用当前描边色填充 |
| 文字 | T | 点击添加文本；可改字体、字重、字号，支持 Markdown 编辑 |
| 智能画板 | F | 拖出画板区域；提交后可调尺寸预设、画板色、锁定、裁切溢出 |
| 上传文件 | I | 本地 **图片 / 视频 / 音频 / Lottie JSON** 放到画布 |
| 图像生成器 | A | 放置文生图节点，见 [图片生成](/guide/image-generation) |

更多生成器在画布空白处**右键 → 生成器**：视频 / 音频 / Lottie（见 [视频生成](/guide/video-generation)、[音频](/guide/audio)、[Lottie](/guide/lottie)）。

底部 HUD 还可打开左侧**资产**栏：查看本账号 AI 生成的图片 / 视频 / 音频等，拖到画布复用。详见 [资产](/guide/assets)。


## 智能画板


- 一个项目可有多个画板（如手机稿 + 海报）；尺寸预设按场景（网站 / 移动 / 海报等）分组。
- 画板工具条：尺寸预设、画板颜色、锁定画布、裁切溢出、横竖翻转等。
- **新建画板会出现在图层栈顶**（盖住下方元素）；可用图层面板或快捷键调整叠放顺序。
- 导出、分享预览与广场封面会优先使用当前 / 合适的画板。

## 图层

打开**图层面板**可管理画布上的内容：

| 能力 | 说明 |
|------|------|
| 列表范围 | 同时列出**画板（Frame）**与形状 / 文字 / 图片 / 视频等节点 |
| 搜索 | 按名称过滤 |
| 排序 / 叠放 | 拖拽或快捷键调层级（与画布 z 序一致） |
| 显示 / 隐藏 | 眼睛图标；画板也可隐藏 |
| 锁定 | 防止误选误改 |
| 命名提示 | 图像生成器节点在列表中显示为「图像生成器」一类名称（以界面为准） |

常用快捷键：\`]\` / \`[\` 顶层 / 底层；\`Ctrl + ]\` / \`Ctrl + [\` 上移 / 下移一层；\`Ctrl + Shift + H\` 显隐；\`Ctrl + Shift + K\` 锁定。

左下角**小地图**可定位视口；可开关网格吸附。

## 多选与对齐

- 框选或 Shift 点选多个对象后，会出现多选工具条。
- 常见操作：对齐（左 / 中 / 右、上 / 中 / 下）、分布、统一尺寸、成组相关操作（以工具条为准）。
- 单选时工具条提供填充、描边、圆角、混合模式、不透明度等。

## 填充与样式

选中形状或画板后可设填充：

- 纯色、线性渐变、径向渐变
- **弥散**（网格渐变，可在弥散编辑器中调控制点）

## 描边

选中开路径或可描边形状后，可在描边面板调整线宽、对齐、线帽与线接。默认约定：

| 对象 | 线帽 | 线接 |
|------|------|------|
| 直线、钢笔 | Butt | Miter |
| 画笔、箭头 | Round | Round |

可在面板中显式覆盖。闭合路径通常不展示线帽选项。

## 路径编辑与轮廓化

- **双击**钢笔 / 路径类节点进入路径编辑；子工具含选择、钢笔追加锚点、曲线（对应 Alt / Option 转换锚点）。
- **轮廓化**将描边烘烤为可编辑填充路径：单段开路径按几何偏移生成轮廓；多子路径（如箭头）取与绘制一致的描边外轮廓。铅笔中线会先稀疏采样，避免锚点过密。
- 轮廓化后，原描边墨水写入填充；直线 / 钢笔 / 画笔 / 箭头不再叠加 SVG 描边，以免双边框。

## 文字与字体

- 双击文字进入编辑；支持基础 Markdown。
- 工具条可改**字体族、字重、字号**；字体列表可搜索，含平台预置字体。
- 需要从图片里拆出可编辑文字时，可用 Agent 自然语言描述（如「把图中文字拆成图层」）。

## 图片相关

- 上传或生成的图片都是图片节点；工具条能力见 [图片编辑工具](/guide/image-tools)。
- 需要文生图时用生成器节点（**A**）或 Agent「图片」模式。

## 视频

- 本地上传、拖放，或 [视频生成](/guide/video-generation)（右键生成器 / Agent「视频」）。
- 选中后：剪辑、裁剪、翻转、**提取帧**、全屏、下载；导出可选 MP4 / MP3（音轨）。
- **提取帧**会在旁生成图片节点，便于继续用图片工具编辑。
- 删除「上传中」占位会中止上传，且**不可撤销恢复**。

## 音频与 Lottie

- **音频**：上传或 [音频生成器](/guide/audio)；选中后可截取、变速（生成副本）。
- **Lottie**：上传 \`.json\` 或 [Lottie 生成器](/guide/lottie)；可播放、循环、调速、替换 / 导出 JSON。Lottie **不进**资产库。

## 画笔

画笔（**Shift + P**）支持自由绘制；工具条可开**橡皮**，以及笔刷库、自定义戳章、硬度 / 压感等（以界面为准）。

## 保存与云同步


- 登录后文档会自动云同步；**Ctrl + S** 可手动保存。
- 离开编辑器时会尽量同步文档与项目封面。
- 多端以云端为准；本地会尽量保留未同步草稿。详见 [FAQ](/faq/)。

## 导航小提示

- 空格 / 手型：平移；滚轮：缩放；Ctrl + 0：100%；Shift + 1：适合全部内容。
- 选中后拖拽边角做缩放变换。
`,Ha=`# 自定义与第三方模型

你可以在 recombyn 里接入**自己的 API Key**（BYOK），用兼容 OpenAI / Claude 风格的第三方服务，而不是只走平台内置模型。

入口：**账户设置 → Agent → 第三方模型**。保存后，模型会出现在对话区底部的**模型列表**里，可直接选用。

## 谁可以添加？

| 环境 | 条件 |
|------|------|
| **网页 / 云端桌面** | 一般需 **标准档（Plus）及以上**会员；未开通时界面会提示升级 |
| **桌面端本地版** | 不依赖平台会员；本地版本身没有平台模型目录，**需要自己配第三方 Key** 才能对话 / 出图 |

## 两种添加方式

打开「第三方模型」后，先选**供应商**：

### 1. 平台目录（推荐）

列表里会有内置平台（如 **OpenRouter**、**火山方舟 / 豆包** 等，以产品内实际为准）。

1. 选中某个平台。
2. 一般**只需粘贴 API Key**（请求地址、常用模型会自动填好）。
3. 点保存。保存后，该平台在目录里已接入的对话 / 图片 / 视频模型，会出现在模型选择列表中。

部分平台还支持 **「添加模型」**：在已保存 Key 的前提下，把目录里没有的模型 ID 补进列表（需填模型 ID、显示名称、图标、分类：对话 / 多模态 / 图片 / 视频）。

### 2. 手动填写

选 **「手动填写」**，自己配任意兼容端点：

| 字段 | 说明 |
|------|------|
| **模型类型** | **对话**：聊天改稿；**多模态**：可看参考图；**图片**：文生图 / 图生图类接口；**视频**：视频生成类接口 |
| **供应商名称** | 显示用，例如你的中转商名称 |
| **官网链接** | 可选 |
| **模型 ID** | 上游接口里的 \`model\` 字段，不是你自己起的显示名 |
| **API Key** | 供应商发给你的密钥 |
| **请求地址** | 兼容端点，需以 \`http://\` 或 \`https://\` 开头，**不要**以 \`/\` 结尾 |

保存后即可在模型列表中选用。能否真正出图 / 出视频，取决于上游是否兼容，以及产品内对应生成器是否已接好该类型。

## 在哪里选用？

1. 打开编辑器右侧 Agent 面板。
2. 点输入框下方的**模型按钮**。
3. 列表分区一般为 **设计** / **图片** / **视频**（以界面为准）。

也可在模型相关入口点「添加模型」，会打开同一套账户 → Agent 配置。

## 计费与积分（以实际扣费为准）

接入自有 Key 后，**上游费用走你自己的供应商额度**。

若实例**未开启平台积分**（桌面本地版，或自托管 \`WALLET_BILLING_ENABLED=false\`），则**一律不扣**平台积分，界面也不显示余额 / 预计消耗。见 [账户与积分 · 何时看不到积分](/guide/account#何时看不到积分--方案)。

在 **Recombyn Cloud 等已开启积分**的环境，平台侧是否还扣取决于能力：

| 能力 | 平台积分 |
|------|----------|
| **图片 / 视频生成**（生成器节点、对话里的图片·视频模式等，且选用的是你的 BYOK / 平台目录 Key） | **不扣**平台积分 |
| **设计 Agent 改画布**（「自动」等会预扣并按用量结算的路径） | **仍会**占用平台积分（预扣 / 结算），即使本轮模型是第三方 |

免费档通常只能用 Auto；自选平台模型与第三方一般需会员（本地桌面版 / 积分关闭的自托管除外）。平台模型与图片工具见 [账户与积分](/guide/account)。


## 密钥如何保存

- 网页登录态下，Key 可能加密存入账户侧的**保险箱**，供服务端代你请求上游（仍是你的 Key，不是平台公用 Key）。
- 也会在本机保留一份配置；清除站点数据或清空本地桌面应用数据后，可能需要重新添加。
- 请勿把 Key 发到公开 Issue / 群聊。

## 常见问题

**保存按钮是灰的 / 提示要开通会员？**  
网页与云端桌面需标准档及以上。本地桌面版一般可直接保存。

**保存了但列表里看不到？**  
确认已点「保存供应商」；刷新后再打开模型列表。手动填写时检查模型 ID 与请求地址。

**选了第三方模型，为什么还扣平台积分？**  
仅在平台积分**已开启**时：若本轮是**设计 Agent 改画布**，仍会预扣 / 结算。纯 BYOK **图片·视频生成**一般不扣。本地版与默认自托管不会扣平台积分。


**本地桌面没有 Seedream 等平台模型？**  
正常。本地版不展示平台 LLM 目录，请按本文添加 OpenRouter / 方舟或手动端点。详见 [桌面端](/guide/desktop)。

## 相关文档

- [Agent 用法](/guide/agent)
- [账户与积分](/guide/account)
- [桌面端](/guide/desktop)
- [图片生成](/guide/image-generation)
- [图片编辑工具](/guide/image-tools)
`,Ua=`# 桌面端

recombyn 提供 **Tauri** 桌面应用，有两种口味：

| 版本 | 用途 | API |
|------|------|-----|
| **Local（本地版）** | 数据与模型都在本机；适合自用、离线向工作流 | 内嵌 API（SQLite），本机 \`127.0.0.1:8000\` |
| **Cloud（云端版）** | 界面是桌面壳，业务走线上账号与云端 API | 默认 \`https://recombyn.com\`（可用环境变量覆盖） |

## 本地版 vs 云端版（使用差异）

| | 本地版 | 云端版 |
|--|--------|--------|
| 登录 | 按系统用户**自动登录**，一般无邮箱验证码 | 与网页相同（邮箱 / Google 等） |
| 项目数据 | 本机 SQLite + 本地上传目录 | 云端同步 |
| 平台模型目录 | **不提供**（无 Seedream 等平台列表） | 与网页一致 |
| 第三方模型 | **必配**才能对话 / 出图；不强制会员 | 标准档及以上可配 |
| 方案 / 卡密 / 升级 / 余额 | 界面**隐藏**（平台积分关闭） | 与网页一致（Cloud 开启积分时） |
| 对话 / 出图 / 图片工具钱包 | **不扣**平台积分（无预扣、无余额拦截） | 与网页一致 |

本地版配置第三方模型的步骤见 [自定义与第三方模型](/guide/custom-models)。自托管实例默认同样关闭平台积分（\`WALLET_BILLING_ENABLED=false\`），见 [账户与积分 · 何时看不到积分](/guide/account#何时看不到积分--方案)。


## 开发与打包（命令）

在仓库根目录先装好依赖：Node、\`npm install\`；本地版发布还需 **Rust** 工具链，以及 API 侧 Python 环境（见仓库 \`docs/desktop.md\`）。

\`\`\`bash
# 开发：本地版（热更新 API + 桌面窗口）
npm run dev:desktop

# 开发：云端版（连远程 API）
npm run dev:desktop:cloud

# 只构建 API 边车（PyInstaller → sidecars）
npm run build:desktop:sidecar

# 打包发布：本地版（会嵌入边车）
npm run build:desktop

# 打包发布：云端版（无边车）
npm run build:desktop:cloud
\`\`\`

强制重打边车再打包时，可设环境变量（Windows PowerShell 示例）：

\`\`\`powershell
$env:RECOMBYN_REBUILD_SIDECAR="1"; npm run build:desktop
\`\`\`

## 打包产物路径

执行 \`npm run build:desktop\`（或 cloud）成功后，常见输出：

| 产物 | 路径 |
|------|------|
| 安装包（NSIS / MSI 等） | \`apps/web/src-tauri/target/release/bundle/\` |
| 未打包的主程序 | \`apps/web/src-tauri/target/release/recombyn.exe\` |
| API 边车（构建暂存） | \`apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe\` |

云端版安装包也在同一 \`bundle/\` 目录下，产品名一般为 **Recombyn Cloud**。

> 更细的架构、边车入口与排错见仓库内工程文档：\`docs/desktop.md\`（面向开发者）。

## 常见问题

**提示 Request failed / 技能加载失败？**  
本地库是新的 SQLite 时，旧的云端登录态可能不匹配。退出后让本地版重新自动登录，或清掉本地库后再开（开发环境常见路径见 \`docs/desktop.md\`）。

**仍然出现邮箱登录页？**  
自动登录失败时会出现。拉最新代码、重启 \`dev:desktop\`，或按工程文档清理本地 DB 后再试。

**边车构建失败？**  
在 \`apps/api\` 虚拟环境中安装桌面依赖（\`pip install -e ".[desktop]"\`），再跑 \`npm run build:desktop:sidecar\`。

**8000 端口被占用？**  
关掉其它占用 8000 的 API / 旧桌面进程后再启动。

**想用云端账号与会员？**  
请使用 **Cloud** 桌面构建，或直接用网页版，而不是 Local。

## 相关文档

- [自定义与第三方模型](/guide/custom-models)
- [账户与积分](/guide/account)
- [快速入门](/guide/getting-started)
- [常见问题](/faq/)
`,Wa=`# 快速入门

欢迎使用 **recombyn**：用自然语言描述目标，在无限画布上生成、调整海报、界面与图形，并保留可继续编辑的结构。

## 第一步：登录账号

1. 打开 [recombyn.com](https://recombyn.com)。
2. 使用邮箱验证码或 Google 登录。
3. 登录后即可使用首页、项目库与编辑器。

首次登录会创建账户。在 Cloud / 已开启平台积分的环境，对话 / Agent / 出图共用统一积分；本地版与默认自托管不显示积分钱包。

## 第二步：了解工作台

| 区域 | 作用 |
|------|------|
| 首页 | 选品类（网站 / 移动 / 图片 / 视频 / 海报 / 绘画等）、发需求、导入、灵感；侧栏含**技能**工具箱 |
| 编辑器画布 | 无限画布 + 多画板；右键「生成器」可出图 / 视频 / 音频 / Lottie；左侧**资产**栏复用生成结果 |
| 右侧 Agent | 自动 / 询问 / 图片 / 视频；\`/\` 固定 Skill；可选 Auto 路由 |
| 账户 | 个人资料、Agent 偏好；Cloud 下还有方案与积分 |


## 第三步：创建第一个项目

任选一种方式：

- **首页发需求**：选海报 / 移动应用 / 网站 / 图片，描述目标后发送 → 进入编辑器并由 Agent 开稿（可调协作节奏与运行方式）。
- **空白画布**：侧栏「+」创建空项目，再自己画或按 **C** 唤起 Agent。
- **灵感案例**：在 [广场](/features/plaza) 打开案例，复制到自己的项目继续改。
- **导入文件**：将图片转为可编辑画布，见 [导入文件](/features/import)。

## 第四步：用 Agent 或生成器改稿

1. 右侧输入框描述修改（例如「标题改大一点，主色换成深蓝」）；模式选 **Agent** 直接改画布，或 **询问** 先看方案。
2. 需要纯出图时：模式选 **图片**，或按 **A** 放置 [图像生成器](/guide/image-generation)。
3. 先上传或粘贴图片，再用 \`@\` 引用当前对话中的附件；模型通过模型按钮选择 **Auto** 或手动指定。
4. 生成过程中可随时停止；结果落在画板上后仍可手改，或用 [图片编辑工具](/guide/image-tools) 抠图、扩图、多角度等。

账户里可将 Auto 偏好设为 **标准版 / Pro / Max / 自定义车道**；还可添加第三方模型（自有 Key，见 [自定义与第三方模型](/guide/custom-models)）。桌面安装与打包路径见 [桌面端](/guide/desktop)。更多：[Agent 用法](/guide/agent)、[账户与积分](/guide/account)。

## 第五步：导出与分享

- **Export**：按画板或选区导出 PNG / JPG / SVG 等，可选倍率与导出全部页面。
- **Share**：生成链接；预览链接无需登录，可编辑链接需登录后保存。详见 [导出与分享](/features/export-share)。

## 新手提示

- Cloud：免费档每天有 Auto 试用；更多额度见「方案」与卡密兑换；账单在「用量与账单」。本地 / 自托管默认无平台积分 UI。
- 作品会云端同步（Cloud）；离开编辑器时会自动保存文档与封面。
- 账户「通知公告」可看产品动态与说明（本地版可能隐藏）。
- 常用键：空格平移、滚轮缩放、**C** 开关 Agent、**A** 图像生成器、**F** 画板；完整列表见 [快捷键](/guide/shortcuts)。
- 卡住时先看 [FAQ](/faq/)；法律与隐私见 [服务条款](/legal/terms)。
`,Ga=`# 图片生成

recombyn 提供两种常用出图方式：**画布上的图像生成器节点**，以及 **Agent 对话里的「图片」模式**。二者共享分辨率、比例、张数与模型设置。

## 图像生成器节点

1. 底部工具栏点 **图像生成器**，或按快捷键 **A**。
2. 视口中央会出现生成器卡片；**仅选中该节点**时显示输入框。
3. 输入提示词；可用 **+** 上传参考图，或用 \`@\` 引用已有附件。
4. 点击设置芯片调整：**分辨率 · 比例 · 张数**（例如 \`2K · 1:1 · 1张\`）。
5. 选择生图模型后发送（平台积分开启时，可先确认旁侧预计消耗）。

生成成功后，节点会变成普通图片节点；若一次生成多张，额外结果会进入该图的**多图变体**，可切换主图或拆成独立节点。失败时会提示「图像生成失败」或「未返回图片」，可改提示词 / 模型后重试。

### 常用设置

| 项 | 选项 |
|----|------|
| 分辨率 | 标清 1K / 高清 2K / 超清 4K |
| 比例 | 智能、21:9、16:9、3:2、4:3、1:1、3:4、2:3、9:16 |
| 数量 | 1–4 张 |
| 智能比例 | 由模型根据内容确认比例 |

平台积分开启时，消耗会显示在发送按钮旁（闪电图标 + 数字），以当前所选模型与张数为准。本地版 / 默认自托管不显示、也不扣平台积分。

### 平台模型与自有 Key

- **网页 / 云端**：列表里的 Seedream、GPT Image 等为平台模型，按张扣**平台积分**。
- **第三方图片类型**：可在 [自定义与第三方模型](/guide/custom-models) 里用平台目录（如 OpenRouter）或手动填写「图片」类型；走你自己的额度，不扣平台积分（上游需真正支持出图）。
- **桌面本地版**：没有平台生图目录，需自行配置第三方 Key。见 [桌面端](/guide/desktop)。

## Agent「图片」模式

右侧对话底部可切换交互模式（文案以产品为准）：

| 模式 | 说明 |
|------|------|
| **自动** | 直接改画布：排版、加元素、换图等 |
| **询问** | 先回答 / 出方案；需要改画布时给出可确认的操作预览，点「确认」后才落地 |
| **图片** | 专注文生图 / 参考图生图，控件与生成器节点类似 |
| **视频** | 专注视频生成（以界面与模型列表为准） |

在「图片」模式下描述画面、附上参考图，即可在对话中出图并落到画布。首页发需求时也可选图片类场景，由完整设计流程开稿。

需要视频时请用 Agent「视频」或画布 [视频生成器](/guide/video-generation)；音频与 Lottie 见 [音频](/guide/audio)、[Lottie](/guide/lottie)。



## 参考图与 @ 引用

- **参考图**：上传本地图，或粘贴到对话（Ctrl + V）。
- **@**：从当前对话中已添加的附件里选择引用，方便明确「按这张参考继续」。
- **模型**：通过输入框下方的模型按钮单独选择，不在 \`@\` 面板中。

选中已有图片后，工具栏上的 **Chat** 可对该图做图生图修改（见 [图片编辑工具](/guide/image-tools)）。

生成成功的结果一般会进入左侧 [资产](/guide/assets) 栏，可随时预览并再拖到画布。


## 与完整设计流程的关系

从首页发起「网站 / 移动应用 / 海报」等完整稿时，除交互模式外还有：

- **运行方式**：Agent 流水线（技能链 + 自动路由）或单模型绘图。
- **协作节奏**：人际协同 / 关键节点确认 / 完全自动（见 [Agent 用法](/guide/agent)）。

纯出图场景优先用生成器节点或 Agent「图片」模式即可。
`,Ka=`# 图片编辑工具

选中画布上的**图片节点**后，顶部会出现图片工具条。平台积分开启时，多数 AI 能力会在确认前显示本次消耗；本地版 / 默认自托管不显示、也不扣平台积分。

## 主工具条

| 工具 | 作用 |
|------|------|
| **Chat** | 对该图做提示词编辑（图生图）；可带参考图、选模型与分辨率 |
| **放大** | 超分到预设 **4K** 或 **8K** |
| **去背景** | 抠图；可选「人像/细发」或「产品/硬边」 |
| **橡皮工具** | 画笔涂抹遮罩，确认后擦除对应像素 |
| **多角度** | 调整视角后重生（见下） |
| **更多 …** | 扩展、调整、裁剪、翻转与旋转 |
| 混合 / 不透明度 | Photoshop 风格混合模式 |
| 圆角 | 支持圆角的图片可调圆角 |
| 导出 / 全屏预览 | 单节点导出或全屏查看 |

## 更多菜单

| 操作 | 说明 |
|------|------|
| **扩展** | 向外扩画 / 外延，适合补背景、加留白 |
| **调整** | 光线、曝光、对比度、高光/阴影、白黑场；饱和度、色温、色调；含自动预设 |
| **裁剪** | 画布上拖裁剪框 |
| **翻转与旋转** | 水平/垂直翻转与角度 |

裁剪与扩展会进入画布上的会话式编辑，确认后写回节点。

## 多角度

面板内分 **天空盒** / **摄像头**：

- 预设：正面、侧面、反打、斜侧、俯视、仰视等
- 滑杆：旋转、倾斜、缩放（近 / 中 / 远）
- 确认「立即使用」后按积分出图并替换当前图

## Chat 快速改图

1. 选中图片 → **Chat**。
2. 输入修改说明（例如「换成暖色灯光」「去掉背景杂物」）。
3. 可选参考图、模型与张数；当前图会作为主参考。
4. 生成中显示「修改中」；结果写回节点（多张进入变体）。

若该图曾由 AI 生成，输入框可能预填当时的提示词，便于微调。

## 多图变体

一次生成多张时，节点上会显示「N 张图」：

- **查看全部**：展开全部结果
- **设为主图**：指定当前显示的那一张
- **单独成节点**：把某张拆到画布上独立编辑

## 参考积分（工具）

以下为**平台积分已开启**时的云端默认参考价（未指定模型单价时）。**走大模型**的能力先扣再执行，失败时当前实现不一定自动退回。**本地视觉 / 不调大模型**的能力不扣平台积分。

桌面本地版、以及 \`WALLET_BILLING_ENABLED=false\` 的自托管：**不扣**平台积分，确认按钮旁也不显示消耗数字。

| 工具 | 约计积分 |
|------|----------|
| 去背景 | **0**（本地抠图） |
| 编辑文字 / 编辑元素（分层） | **0**（本地 OCR / 视觉） |
| 调整（前端 CSS 滤镜） | **0** |
| 橡皮等纯画布编辑 | **0**（不走扣费接口） |
| 放大 | 20 |
| 矢量化等 | 20 |
| 扩展 | 30 |
| 多角度 | 30 |
| 替换文字 | 30 |

文生图 / 图生图按所选模型与张数另行计费，以按钮旁数字为准。详见 [FAQ](/faq/) 与 [账户与积分](/guide/account)。


## Agent 相关能力

部分能力主要通过 Agent 工具调用，例如把图中文字拆成可编辑图层（**编辑文字**）。用自然语言描述即可，不必记工具入口。
`,qa=`# Lottie 动画

可在画布上用 **Lottie 生成器**做短动画，或直接上传 **Lottie JSON**。生成 / 上传后都是可播放的 **Lottie 动画**节点。

> Lottie 结果**不会**进入左侧「资产」库（资产目前主要为图片 / 视频 / 音频）。请在画布或导出 JSON 中管理。

## Lottie 生成器

1. 画布空白处**右键 → 生成器 → Lottie 生成器**。
2. 输入创作说明；可上传**参考图**（多模态模型更稳妥；以产品为准）。
3. 在 **Lottie 设置**中调比例与时长，选模型后点**生成**（旁侧可能显示预计积分）。
4. 成功后原位变成 **Lottie 动画**节点。

### 常用设置

| 项 | 选项（以产品为准） |
|----|-------------------|
| 比例 | 1:1（常见默认）、16:9、9:16、4:3、3:4 |
| 时长 | 约 1 / 2 / 3 / 5 / 8 / 10 秒（常见默认 3 秒） |

## 上传现成 JSON

工具栏**上传文件**、画布拖放或粘贴 \`.json\` 时，会尝试解析为 Lottie 节点。无效文件会提示「无效的 Lottie JSON」。

## Lottie 节点工具条

| 操作 | 说明 |
|------|------|
| **播放 / 暂停** | 预览动画 |
| **循环** | 是否循环播放 |
| **速度** | 常见 \`0.5× / 1× / 1.5× / 2×\` |
| **调整** | 循环、速度、替换 JSON 等入口（以界面为准） |
| **替换** | 上传新的 \`.json\` 替换当前动画 |
| **下载 / 导出** | 导出 Lottie JSON；顶栏「导出选中」在仅选中 Lottie 时格式为 **JSON** |

## 相关文档

- [图片生成](/guide/image-generation)
- [视频生成](/guide/video-generation)
- [画布与工具](/guide/canvas)
- [导出与分享](/features/export-share)
`,Ja=`# 快捷键

编辑器内可打开快捷键面板查看完整列表（Mac 显示 ⌘，Windows / Linux 为 Ctrl）。下列为常用绑定。

## 画布导航

| 操作 | 快捷键 |
|------|--------|
| 平移画布 | Space + 拖拽（或手型工具 H） |
| 空画布拖拽平移 | 选择工具下拖拽空白处 |
| 滚轮缩放 | 滚轮 |
| 缩放至 100% | Ctrl + 0 |
| 放大 / 缩小 | Ctrl + + / Ctrl + - |
| 缩放以适合所有内容 | Shift + 1 |
| 保存项目 | Ctrl + S |

## 工具切换

| 操作 | 快捷键 |
|------|--------|
| 选择 | V |
| 手型（平移） | H |
| 智能画板 | F |
| 文字 | T |
| 钢笔 | P |
| 画笔 | Shift + P |
| 油漆桶 | B |
| 矩形 | R |
| 线条 | L |
| 箭头 | Shift + L |
| 椭圆 | O |
| 上传文件（图 / 视频 / 音频 / Lottie JSON） | I |
| 图像生成器节点 | A |
| 视频 / 音频 / Lottie 生成器 | 画布右键 → 生成器（无单独默认快捷键） |
| 打开 / 关闭 Agent 面板 | C |

| 退出路径编辑 / 关闭面板 | Esc |

## 节点编辑

| 操作 | 快捷键 |
|------|--------|
| 复制 / 剪切 / 粘贴 | Ctrl + C / X / V |
| 创建副本 | Ctrl + D |
| 全选（选择工具下） | Ctrl + A |
| 撤销 | Ctrl + Z |
| 重做 | Ctrl + Shift + Z（或 Ctrl + Y） |
| 删除选中 | Delete（Backspace 留给文字编辑） |

## 图层排列

| 操作 | 快捷键 |
|------|--------|
| 移至顶层 / 底层 | ] / [ |
| 上移 / 下移一层 | Ctrl + ] / Ctrl + [ |
| 显示 / 隐藏选中图层 | Ctrl + Shift + H |
| 锁定 / 解锁选中图层 | Ctrl + Shift + K |

## 对话（Agent）

| 操作 | 快捷键 |
|------|--------|
| 打开 / 关闭 Agent | C |
| 输入 @ 选择已添加的附件 | @ |
| 粘贴图片或内容到对话 | Ctrl + V |
| 将画布选中内容添加到对话 | Ctrl + Shift + L |
| 发送消息 | Enter |
| 插入换行 | Shift + Enter |
| 取消编辑 / 关闭面板 | Esc |

## 小提示

- 钢笔 / 路径编辑可用 **Enter** 或 **Esc** 结束；路径编辑工具条可切换选择 / 钢笔 / 曲线后确认完成。
- 文字内联编辑中 **Esc** 退出编辑。
- 多图变体展开、快捷键面板等浮层也可用 **Esc** 关闭。
`,Ya=`# 技能（Skills）

**技能**是可启用的能力包：官方内置或你自己上传的 \`.zip\`。启用后，Agent / 对话可按技能说明协作；也可在输入框用 \`/\` **为本回合固定**某个 Skill。

## 打开技能工具箱

首页左侧轨道点 **「技能」**，进入**技能工具箱**。

| 分区 | 说明 |
|------|------|
| **官方** | 平台提供的技能；可按需关闭不需要的项 |
| **我的** | 你上传的个人技能；可启用、预览说明、删除 |

## 上传个人 Skill

1. 在「我的」中点**上传 Skill**，选择 \`.zip\` 技能包。
2. 上传后会进入**安全检测**；通过后才会出现在列表。未通过会提示原因。
3. 若与已有 Skill **同名**，可选择覆盖并更新。

请勿上传含恶意脚本或不安全内容的压缩包。检测与启用规则以产品提示为准。

## 在对话里使用 \`/\`

1. 打开编辑器右侧 Agent 面板。
2. 在输入框输入 **\`/\`**，搜索并选择 Skill。
3. 选中后会以芯片形式**固定到当前回合**；发送后本轮按该技能指令执行（与全局启用列表配合，以实际行为为准）。

提示：输入 \`@\` 用于附件 / 引用；\`/\` 用于 Skill。可在 Skills 页先启用常用技能，再在 Chat 里用 \`/\` 点名。

## 与 Agent 流水线的关系

首页开稿或「自动」改画布时，后端可能按任务走**技能链**协作（活动日志里可见查技能等步骤）。工具箱里的开关与 \`/\` 固定，用于控制可用技能与当轮点名。详见 [Agent 用法](/guide/agent)。

## 相关文档

- [Agent 用法](/guide/agent)
- [快速入门](/guide/getting-started)
- [自定义与第三方模型](/guide/custom-models)
`,Xa=`# 视频生成

可用两种方式生成视频：**画布上的视频生成器节点**，以及右侧 Agent 的**「视频」模式**。设置项（比例、分辨率、时长、模型）大体一致。

## 视频生成器节点

1. 画布空白处**右键 → 生成器 → 视频生成器**（工具栏「图像生成器」只放图像节点）。
2. 选中该节点后输入描述（占位文案类似「描述你想生成的视频」）。
3. 用设置芯片调整**比例 · 分辨率 · 时长**，并选择视频模型；发送旁会显示预计积分。
4. 可用 **+** 或 \`@\` 附加**参考图**（也可挂视频附件；发给模型的参考以图为主，以产品为准）。
5. 点**生成**。成功后节点**原位变成视频节点**并保持选中。

### 常用设置

| 项 | 选项（以产品为准） |
|----|-------------------|
| 比例 | 16:9（常见默认）、9:16、1:1、4:3、3:4 |
| 分辨率 | 480p、720p（常见默认）、1080p |
| 时长 | 约 4–15 秒（常见默认 5 秒） |

平台视频模型按规则扣**平台积分**；第三方视频类型 Key 一般不扣平台积分（见 [自定义与第三方模型](/guide/custom-models)）。

## Agent「视频」模式

右侧对话切换到**视频**：描述镜头 / 画面，可附参考图，控件与生成器类似。

- 结果会出现在对话里的**可播放视频**区域，可预览。
- 若要从资产库再放到画布：打开左侧 [资产](/guide/assets)，找到对应**视频**条目后拖入画布。
- 生成成功后通常会写入资产库（类型「视频」）。

## 画布上的视频节点

本地上传或生成得到的视频，选中后可用工具条：

| 能力 | 说明 |
|------|------|
| 剪辑 / 裁剪 | 调整片段与画面范围（以界面为准） |
| 提取帧 | 首帧或当前位置生成旁侧图片节点，便于用 [图片编辑工具](/guide/image-tools) 继续改 |
| 全屏 / 下载 | 预览与本地下载 |
| 导出 | 顶栏导出选中时，仅视频可选 **MP4**，或导出音轨为 **MP3**（见 [导出与分享](/features/export-share)） |

也可通过工具栏**上传文件**或拖放本地 \`video/*\` 到画布。上传中占位被删除会中止上传，且不可撤销恢复。

## 相关文档

- [图片生成](/guide/image-generation)
- [资产](/guide/assets)
- [Agent 用法](/guide/agent)
- [画布与工具](/guide/canvas)
- [导出与分享](/features/export-share)
`,Za=`# 关于我们

**用对话做出可编辑的设计。**

recombyn 是一款设计 Agent：你用自然语言描述目标，它在无限画布上生成、调整海报、界面与图形，并保留可继续编辑的结构。

## 它是什么

把「说清楚想要什么」变成可落地的设计稿。Agent 会拆解意图、选版式与素材、落点到画板，并支持继续对话迭代。你也可以随时手动改节点、换图、调字体。

## 个人开发

recombyn 由独立开发者在业余时间打造。目标很简单：让「用对话做设计」真正好用。

如果你愿意支持这个项目继续迭代，欢迎看看 [赞助页](/sponsor)（自愿，无强制）。

## 你能做什么

- 从一张海报、一组图标到移动端 / 网页布局
- 导入参考图，在画布上扩图、多视角与抠图等
- Auto 路由或自选模型；会员可接入自有 Key 的第三方兼容模型
- 发布作品到广场；分享预览 / 协作编辑链接
- 用 Agent 自动跑完整流程，或半自动在关键节点停下来确认

## 方案与计费

免费档适合轻体验（每天 Auto 试用）。付费档按月赠送统一积分（对话 / Agent / 出图共用），并可解锁模型自选与第三方模型等能力。也可通过卡密兑换套餐或补充积分。账单与流水见账户「用量与账单」。详见产品内「方案」页与 [账户与积分](/guide/account)。

## 反馈

产品仍在快速迭代。若你遇到卡顿、生成偏差或想要的功能，欢迎通过账户设置里的**通知公告**与反馈入口告诉我们。

## 禁止套壳与仿冒

recombyn 采用源码可得协议：个人自用与组织内部部署可以，**未经授权不得**换皮售卖、对外做成公众注册的托管服务，或冒充官方品牌 / 官网 / 客服。

- 官方站点：[recombyn.com](https://recombyn.com)
- 帮助文档：[快速入门](/guide/getting-started)
- 源码仓库：[github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

发现仿冒或违规托管，请发邮件至 \`702680355@qq.com\`（附链接与截图）。详见仓库 [LICENSE](https://github.com/recombyn/recombyn/blob/main/LICENSE)。

## 相关链接

- [开始创作](https://recombyn.com)
- [帮助文档首页](/guide/getting-started)
- [服务条款](/legal/terms)
- [隐私政策](/legal/privacy)
- [AI 服务说明](/legal/ai-terms)
`,Qa=`# AI 服务说明

> 最近更新：2026年7月28日

本说明是 [服务条款](/legal/terms) 的补充，专门约定 AI 相关能力的使用方式与边界。功能操作见 [Agent 用法](/guide/agent)、[图片生成](/guide/image-generation) 与 [图片编辑工具](/guide/image-tools)。

## 1. AI 能力范围

包括但不限于：

- 对话式设计 Agent（Agent / 询问 / 图片等模式）
- 文生图 / 图生图与画布图片编辑工具
- 按任务自动选择模型（**Auto**）及用户可配置的路由偏好（标准 / Pro / Max / 自定义车道）
- 会员可用的**兼容第三方端点**（自有 API Key）

具体能力、模型列表与配额以产品内实际提供为准。

## 2. 平台模型与第三方模型

**平台侧模型**（含云厂商、聚合渠道等）：调用时，必要的提示词、参考图、画布摘要与工具上下文可能被发送至相应服务商，并按其服务条款与隐私政策处理。

**你添加的第三方供应商（BYOK）**：

- API Key 与端点配置通常仅保存在你的浏览器本地（见 [隐私政策](/legal/privacy)）。
- 请求发往你指定的服务；数据处理受该供应商政策约束。
- 平台不保证第三方端点的可用性、合规性或输出质量；请仅使用你有权使用且信任的服务。

## 3. Auto 路由

选择 Auto 时，系统可能先判定任务「车道」（如轻量 / 标准 / 推理 / 多模态），再映射到对应模型；需要时另走生图模型。路由策略、重试与安全规则由平台管理，可能随版本调整。自定义车道仅影响映射表，不保证每次调用某一固定模型以外的行为。详见 [Agent 用法](/guide/agent#auto-路由偏好)。

## 4. 输出与审核

AI 输出可能不准确、不完整或带有偏见，也可能与品牌规范或当地法规要求不符。用于正式场合前，请你自行审核、修改。你对最终采用的内容负责。

## 5. 禁止用途

不得利用 AI 能力生成或传播违法违规、侵权、欺诈、仇恨或有害内容；不得尝试绕过安全、配额或计费限制；不得将他人密钥或未授权端点接入本服务。

## 6. 内容归属

你输入的提示与上传素材，以及据此在本服务画布上形成的可编辑设计稿，权利归属适用服务条款中的「用户内容」约定。模型服务商可能按其政策对请求日志保留有限期限。

## 7. 积分与费用

- 使用**平台模型**的对话、Agent、出图与图片工具可能消耗统一积分；失败重试与退回规则以产品展示为准（图片工具多为先扣费，失败不一定自动退回）。
- 使用**自有 Key** 时：图片 / 视频生成一般不扣平台积分；设计 Agent 改画布仍可能预扣 / 结算平台积分。你须自行承担供应商侧费用。
- 同一流程中若仍调用平台生图或图片工具，那些步骤仍按平台规则计费。


详见 [账户与积分](/guide/account)。

## 8. 变更

我们可能增减模型、调整路由策略、车道默认值或配额。重大变更会尽量通过产品内说明或通知公告告知。
`,$a=`# 隐私政策

> 最近更新：2026年7月28日

> 当你向 **recombyn** 提供输入时，请勿提交你本人或他人的敏感个人信息（如身份证号、精确住址、财务账户、健康信息等）。

## 1. 我们收集的信息

为提供服务，我们可能收集：

| 类别 | 示例 |
|------|------|
| **账户** | 邮箱、显示名、简介、头像、登录方式（邮箱 / Google） |
| **会话与安全** | 登录态、验证码相关记录、必要的安全日志 |
| **项目内容** | 画布文档、上传图片、项目封面 |
| **用量与计费** | 积分余额与流水、方案信息、卡密兑换结果（不含完整卡密明文长期展示） |
| **协作与分享** | 分享链接设置、协作者标识（如用户名 / 邮箱 / ID，以你主动添加为准） |
| **广场** | 你提交发布的作品元数据与封面、审核相关信息 |
| **产品通信** | 你主动提交的反馈；账户内通知 / 公告的已读状态 |
| **诊断** | 接口错误、性能与防滥用相关日志 |

若使用 Google 等第三方登录，我们会获取你授权范围内的基本资料。

## 2. 信息如何使用

我们使用上述信息用于：创建与维护账户、保存与渲染设计、提供 AI 辅助、计费与积分核销、协作分享与广场展示、安全防护与防滥用、发送产品公告 / 通知、改进产品体验。

## 3. 本地存储（浏览器）

部分数据**仅保存在你的设备本地**，通常不会上传为我们的服务器凭据，例如：

- **第三方模型 API Key** 与自定义供应商配置（自有 Key）
- **Auto 路由偏好**（标准 / Pro / Max / 自定义车道映射）
- 语言、主题、部分 UI 偏好

清除浏览器站点数据会导致上述本地配置丢失，需重新登录或重新填写 Key。请勿在共享电脑上保存敏感 Key。

## 4. 存储与安全

云端数据可能存储在我们配置的服务器、数据库或对象存储中。头像与项目封面等资源会以 URL 形式引用云存储对象。我们采取合理的技术与管理措施保护数据，但无法保证绝对安全。

## 5. 第三方服务

本服务可能依赖第三方（云服务、平台侧大模型 API、登录提供方、支付 / 发卡渠道等）。

- **平台模型**：调用时，必要的提示词、参考图与画布上下文可能被发送至模型服务商，按其服务条款与隐私政策处理。
- **你配置的第三方端点（BYOK）**：请求由你的浏览器 / 我们的服务按产品实现发往**你指定的供应商**；该供应商如何处理数据受其政策约束，我们无法控制。请仅添加你信任的端点。
- 我们仅在实现功能所需范围内共享信息，并建议你同时阅读相关第三方的隐私说明。

## 6. 广场、分享与协作

若你将作品发布到广场，或开启分享链接 / 邀请协作者，相关内容可能对其他用户、持有链接者或受邀协作者可见。请勿发布不愿公开的个人信息或机密资料。预览链接可能无需登录即可查看。

## 7. Cookie 与同类技术

我们使用 Cookie / localStorage 等技术记住登录状态、语言与主题、路由偏好等。你可以在浏览器中清除，但这可能导致需要重新登录或丢失部分本地偏好（含第三方 Key）。

## 8. 你的选择

你可以更新资料、管理项目与分享权限、删除本地偏好，或联系我们协助处理账户相关请求。在适用法律允许的范围内，你可要求查阅、更正或删除与你相关的个人信息。

## 9. 未成年人

本服务主要面向具备完全民事行为能力的用户。若你未满当地法定年龄，请在监护人同意与指导下使用。

## 10. 政策更新

我们可能更新本隐私政策。重大变更将尽量通过产品内提示或 [通知公告](/guide/account#通知公告) 告知。继续使用即表示你知悉更新后的政策。

## 11. 联系我们

隐私相关问题，请见 [关于我们](/legal/about)。
`,eo=`# 服务条款

> 最近更新：2026年7月28日

欢迎使用 recombyn（以下简称「本服务」）。访问或使用本服务，即表示你已阅读并同意本服务条款。若不同意，请停止使用本服务。

## 1. 接受条款

使用本服务即表示你同意受本条款约束。我们可能与 [隐私政策](/legal/privacy)、[AI 服务说明](/legal/ai-terms) 一并适用。帮助文档中的功能说明是对产品能力的解释，若与本条款冲突，以本条款为准。

## 2. 服务说明

recombyn 提供基于对话与工具的设计辅助能力，包括但不限于：无限画布与多智能画板编辑、Agent / 询问 / 图片等交互模式、文生图与图片编辑工具、Auto 模型路由、第三方兼容模型接入（自有 Key）、文件导入、导出与分享协作、灵感广场等。功能可能随产品迭代调整，我们会尽量提前说明重大变更。

## 3. 账户与安全

你需对账户凭据与登录行为负责，不得将账户出借、转让给他人用于违法或滥用用途。如发现未经授权的访问，请尽快联系我们。你应对保存在本机的第三方 API Key 自行保管；因 Key 泄露导致的供应商侧费用或损失，由你自行承担。

## 4. 用户内容

你在本服务中上传、创建或发布的内容（设计稿、文案、图片等）归你所有。你授予我们为提供服务所必需的、有限的处理与展示许可（例如渲染、存储、广场展示、分享预览）。请确保你有权使用相关素材，且内容不侵犯第三方权利。

## 5. 合理使用

禁止利用本服务从事违法违规活动，包括但不限于：侵犯知识产权、传播恶意软件、骚扰他人、绕过计费或配额限制、对系统进行攻击或滥用自动化请求、利用 AI 生成违法或有害内容。我们可在合理范围内限制、暂停或终止违规账户。

## 6. 积分、方案与卡密

- 对话 / Agent / 平台出图与部分图片工具可能消耗**统一积分**。
- 会员方案按产品内「方案」页提供月度赠送与能力差异（如模型自选、第三方模型等）。
- 使用**你自有 Key** 时：图片 / 视频生成一般不扣平台积分；设计 Agent 等路径仍可能占用平台积分。供应商侧费用由你自行承担。

- 卡密可用于兑换套餐或补充积分；兑换一经完成，除法律法规要求或我们明确承诺的情形外，通常不支持无理由退款。
- 付费方案在有效期内的切换规则以产品提示为准。

具体以产品说明与 [账户与积分](/guide/account) 为准。

## 7. 分享与协作

你可通过链接分享项目（预览或可编辑）并邀请协作者。你应自行控制公开范围；因你主动分享导致的内容扩散，由你自行评估风险。协作者须遵守本条款；所有者可管理协作者名单。

## 8. 免责声明

本服务按「现状」提供。我们尽力保障可用性与安全，但不对中断、数据丢失、第三方模型输出错误、你所接第三方端点的可用性或不适用特定用途作出保证。AI 生成内容可能不准确，请自行审核后再用于正式场合。浏览器本地检查点等会话快照可能在刷新后失效。

## 9. 责任限制

在法律允许的最大范围内，因使用或无法使用本服务导致的间接、附带或后果性损失，我们不承担责任。与付费相关的责任上限不超过你就该争议事项已向我们支付的金额。

## 10. 条款变更

我们可能更新本条款。更新后继续使用本服务，即视为接受修订后的条款。重大变更将尽量通过页面提示、通知公告或其他合理方式告知。

## 11. 联系我们

如对本条款有疑问，可通过 [关于我们](/legal/about) 或购买卡密时的联系方式与作者沟通。
`,to=`# 常見問題

## 登入與帳戶

**收不到驗證碼？**  
檢查垃圾郵件；確認信箱拼寫；等待冷卻時間後再試。

**Google 登入失敗？**  
確認瀏覽器允許彈窗 / 第三方 Cookie；或改用信箱登入。

## 積分與計費

**為什麼看不到餘額 / 方案 / 卡密？傳送旁也沒有積分數字？**  
桌面**本機版**與多數**自託管**部署預設關閉平台積分（\`WALLET_BILLING_ENABLED=false\`），相關入口與預計消耗會一併隱藏。見 [帳戶與積分](/guide/account#何時看不到積分--方案)。

**自託管提示「Token / 積分不足」？**  
確認是否誤開 \`WALLET_BILLING_ENABLED=true\`；預設應為關閉。關閉後重啟 API。本機版始終不走平台錢包。

**為什麼扣了積分但沒結果？**  
（僅平台積分開啟時）設計 Agent 預扣多數情況會在失敗時退回；**圖片工具**多為先扣再執行，失敗不一定自動退。請保留時間點，在帳戶「用量與帳單」核對，並在產品內回饋。

**免費額度用完了？**  
免費檔每天約 **1 次**設計試用（通常強制 Auto）；用完可等次日重置，或升級方案 / 兌換卡密。

**圖片工具扣多少分？**  
去背景、放大、調整、擴展、多角度等有固定參考消耗；文生圖按模型與張數計費。詳見 [圖片編輯工具](/guide/image-tools) 與按鈕旁數字。

**第三方模型扣平台積分嗎？**  
**BYOK 圖片 / 影片生成**一般不扣平台積分；**設計 Agent 改畫布**即使選用第三方模型，仍可能預扣 / 結算積分。詳見 [自訂與第三方模型](/guide/custom-models) 與 [帳戶與積分](/guide/account)。


**帳單在哪裡看？**  
帳戶 → 用量與帳單（或同類入口）。詳見 [帳戶與積分](/guide/account)。

## Agent 與出圖

**自動 / 詢問 / 圖片 / 影片有什麼區別？**  
自動直接改畫布；詢問先答 / 出方案，需要改畫布時給出操作預覽，點「確認」後才落地；圖片專注生圖；影片專注影片生成。長任務可暫停與繼續生成。見 [Agent 用法](/guide/agent)。

**檢查點撤銷後重新整理又回來了 / 提示快照失效？**  
部分檢查點僅當前會話有效，重新整理後可能失效。重要結果請及時「保留」或匯出。

**怎麼新增第三方大模型？**  
帳戶 → Agent → 第三方模型：可選**平台目錄**或**手動填寫**。網頁一般需標準檔及以上。詳見 [自訂與第三方模型](/guide/custom-models)。

**桌面本機版沒有平台模型 / 怎麼打包？**  
本機版不展示平台 LLM 目錄，需自備 Key；安裝包與 EXE 輸出路徑見 [桌面端](/guide/desktop)。

## 還有問題？

見 [關於我們](/legal/about) 中的回饋方式；功能以產品內實際介面為準。快捷鍵見 [快捷鍵](/guide/shortcuts)。
`,no=`# 匯出與分享

## 匯出

編輯器頂部 **匯出** 選單常見項：

| 入口 | 說明 |
|------|------|
| **匯出全部頁面** | 多畫板時匯出各頁 |
| **匯出選中** | 目前選區或目前畫板內容 |
| **匯出 JSON** | 匯出專案文件結構，便於備份或再匯入 |

| 情況 | 可選格式 |
|------|----------|
| 普通畫板 / 圖形內容 | **PNG** / **JPG** / **SVG** |
| **僅選中影片** | **MP4**，或抽音軌為 **MP3** |
| **僅選中 Lottie** | **JSON** |

倍率約 \`0.5x–4x\`（SVG 通常固定 1x）。更多見 [影片生成](/guide/video-generation)、[音訊](/guide/audio)、[Lottie](/guide/lottie)。

## 分享連結

| 類型 | 說明 |
|------|------|
| **僅預覽** | 持有連結者可查看，**無需登入** |
| **可編輯** | 需登入；僅**所有者與受邀協作者**可改稿 |

## 邀請協作者

分享面板可按使用者名稱 / 信箱 / 使用者 ID 邀請，並管理名單。

## 即時協作：跟隨視口

多人同時編輯時，頂部協作者頭像條可點擊以**跟隨**對方視口；再點或自行平移 / 縮放可停止跟隨。

## 發佈到廣場

提交後需管理員審核。封面要求見 [廣場與靈感](/features/plaza)。
`,ro=`# 匯入檔案

首頁支援將**本機圖片**匯入為可編輯畫布內容。

> 目前產品**不提供** PDF / Word（DOCX）匯入。若舊文案仍提到 PDF / Word，以本頁為準。

## 支援類型

| 類型 | 說明 |
|------|------|
| **圖片** | 圖片節點；可用 [圖片編輯工具](/guide/image-tools) 與 Agent |

常見格式：PNG、JPG、WEBP、GIF 等；副檔名與大小限制以上傳提示為準。

## 建議流程

1. 在首頁選擇匯入（或拖放圖片，若介面支援）。
2. 等待上傳並進入編輯器。
3. 檢查**畫板尺寸**是否符合目標場景。
4. 在 [圖層](/guide/canvas#圖層) 整理順序，隱藏不需要的層。
5. 用 Agent 統一風格或換圖；局部再手修。

## 注意

- 匯入後同樣支援雲端同步與匯出 / 分享。
`,io=`# 功能概覽

## 畫布工作區

無限畫布、多智慧畫板、向量 / 點陣混排；選擇、形狀、鋼筆、畫筆（含橡皮）、油漆桶、文字、圖片上傳與圖像生成器。圖層同時管理畫板與節點；多選可對齊與分布。詳見 [畫布與工具](/guide/canvas)。

## 對話模式

**自動** / **詢問** / **圖片** / **影片**；檢查點撤銷 / 保留與「撤銷到此步驟」；長任務可暫停與繼續生成。Auto 可設標準 / Pro / Max / 自訂車道；會員可接第三方模型。見 [Agent 用法](/guide/agent)。

## 媒體生成、資產與編輯

**圖片**（[圖片生成](/guide/image-generation)）、右鍵生成器的**影片 / 音訊 / Lottie**（[影片](/guide/video-generation)、[音訊](/guide/audio)、[Lottie](/guide/lottie)）、左側**資產**（[資產](/guide/assets)）、首頁**技能**（[技能](/guide/skills)）。圖編輯見 [圖片編輯工具](/guide/image-tools)。



## 匯入檔案

圖片。詳見 [匯入檔案](/features/import)。

## 靈感與廣場

官方 / 社群案例；提交審核。見 [廣場與靈感](/features/plaza)。

## 雲端同步與帳戶

登入後自動同步；Ctrl + S 手動儲存。方案、積分、帳單、卡密、通知、Agent 偏好見 [帳戶與積分](/guide/account)。

## 匯出與分享

常見圖片格式；預覽或協作編輯連結，可邀請協作者。詳見 [匯出與分享](/features/export-share)。
`,ao=`# 廣場與靈感

瀏覽**官方案例**與社群作品，並一鍵開啟到自己的編輯器繼續改。

## 瀏覽

推薦 / 最新 / 我的關注等；品類含網站、移動應用、圖片、**影片**、海報、繪畫等。開啟案例會複製到你的專案。

## 靈感詳情常用動作

| 動作 | 說明 |
|------|------|
| **做同款** | 複製到自己的專案並進入編輯器 |
| **使用提示詞 / 圖片** | 把案例中的提示或素材帶到創作流程 |
| **喜歡** | 加入「我的喜歡」 |
| **關注創作者** | 便於在關注流中看到更新 |
| **分享** | 分享該靈感連結（若已開放） |

## 發佈到廣場

1. 準備好**封面畫板**（多畫板時選代表性一頁）。
2. 填寫標題等並提交。
3. **管理員審核通過**後才會公開展示。

## 個人主頁

**已發佈**、**我的喜歡**、**資產**（與編輯器 [資產](/guide/assets) 相關）。個人主頁「分享」若顯示即將開放，以產品內為準。
`,oo=`# 帳戶與積分

## 開啟帳戶

登入後，透過頭像 / 帳戶入口開啟設定。常見分區：

| 分區 | 內容 |
|------|------|
| **個人資料** | 顯示名、簡介、頭像 |
| **方案** | 會員檔位、權益對比、升級 |
| **積分 / 錢包** | 餘額、預計消耗提示 |
| **用量與帳單** | 儲值與模型消耗流水 |
| **卡密兌換** | 會員套餐或積分儲值 |
| **Agent** | Auto 路由偏好、第三方模型 |

具體入口文案以產品介面為準。

## 統一積分

錢包裡只有一種貨幣：**積分**（對話、Agent、出圖、圖片工具等共用，以流水為準）。

常見扣費方式（雲端 / 網頁）：

| 能力 | 大致規則 |
|------|----------|
| **設計 Agent（自動改畫布等）** | 先預扣一筆，再按實際用量結算；失敗時預扣多數情況會退回 |
| **部分聊天介面** | 可能按次固定扣費（與提示長短無關） |
| **文生圖 / 影片生成（平台模型）** | 按模型、張數 / 規格扣費；按鈕旁常有預計消耗 |
| **圖片工具**（去背景、放大、擴展、多角度等） | 按次固定參考價，**先扣再執行**；失敗時目前實作**不一定自動退回** |
| **BYOK 圖片 / 影片生成** | 一般**不扣**平台積分（走你自己的 Key） |
| **BYOK + 設計 Agent** | 上游用你的 Key，但平台側仍可能預扣 / 結算積分 |

會員每月贈送統一額度。餘額不足時，傳送或出圖可能被攔截；可升級方案、兌換卡密，或等待免費檔每日試用重置。

第三方說明見 [自訂與第三方模型](/guide/custom-models)。

## 何時看不到積分 / 方案

以下場景**不開啟平台積分**，介面會隱藏餘額、方案、卡密、用量帳單與傳送旁預計消耗；服務端也不做預扣 / 扣費：

| 場景 | 說明 |
|------|------|
| **桌面本機版** | 始終關閉平台錢包 |
| **自託管 / 私有部署** | API 環境變數 **\`WALLET_BILLING_ENABLED\` 預設 \`false\`**；需要 SaaS 式計費時再設為 \`true\` |
| **Recombyn Cloud / 網頁正式環境** | 營運開啟積分後，才顯示本頁所述方案與錢包 |

未開啟時請設定自有模型 Key。詳見 [桌面端](/guide/desktop)。

## 會員方案

| 檔位 | 大致定位（以產品內方案頁為準） |
|------|--------------------------------|
| **免費** | 不贈月度積分；每天約 **1 次**設計執行試用（通常強制 Auto；以產品為準） |
| **標準（Plus）** | 每月贈送積分；可自選平台模型；可新增第三方模型 |
| **專業（Pro）** | 更高月度積分；第三方模型與更深能力 |
| **旗艦（Ultra，若上架）** | 最高額度與優先體驗 |

卡片上的「約合 N 次對話 / N 張圖」為按常用模型的**估算**，實際因模型單價與任務而異。

### 方案切換注意

- 付費方案在有效期內通常**不可切換到其他方案**；到期後可再換。
- 同檔續期或**積分卡密**仍可兌換（以兌換提示為準）。

## 用量與帳單

在帳戶的 **用量與帳單**（或同類入口）可查看儲值 / 贈送與消耗紀錄。

若扣了積分卻沒有結果：設計 Agent 預扣多數會退回；**圖片工具**目前多為先扣費，失敗不一定自動退——請保留時間點並在產品內回饋。

## 卡密兌換

1. 開啟兌換入口，輸入卡密（格式多為 \`XXXXX-XXXXX-XXXXX-XXXXX\`）。
2. 支援兩類常見卡密：
   - **會員套餐**：開通對應方案，並到帳月度積分贈送
   - **積分儲值**：直接增加積分餘額
3. 兌換成功後立即生效。除法律法規要求或產品明確承諾外，通常不支援無理由退款。

也可透過「購買卡密」等外鏈管道取得卡密（以產品展示為準）。

## Agent 偏好（帳戶 → Agent）

與編輯器內 Auto 彈層共用同一套設定。

### Auto 路由

| 偏好 | 作用 |
|------|------|
| 標準版 | 跟隨平台預設車道表 |
| Pro / Max | 使用更強的預設車道→模型對應 |
| 自訂車道 | 分別為輕量 / 標準 / 推理 / 多模態 / 生圖指定模型 |

**僅聊天模型為 Auto 時生效。** 詳見 [Agent 用法 · Auto 路由偏好](/guide/agent#auto-路由偏好)。

### 第三方模型

支援**平台目錄**與**手動填寫**。登入網頁時 Key 可能加密保存在帳戶保險箱；詳見 [自訂與第三方模型](/guide/custom-models)。網頁需標準檔及以上；桌面本機版見 [桌面端](/guide/desktop)。

## 相關文件

- [Agent 用法](/guide/agent)
- [自訂與第三方模型](/guide/custom-models)
- [桌面端](/guide/desktop)
- [圖片生成](/guide/image-generation)
- [圖片編輯工具](/guide/image-tools)
- [匯出與分享](/features/export-share)
- [常見問題](/faq/)
`,so=`# Agent 用法

右側對話區是 recombyn 的設計 Agent：理解需求、改畫布、出圖與迭代。按 **C** 開啟 / 關閉面板；**Ctrl + Shift + L** 可將畫布選中內容加入對話。

## 互動模式

對話輸入區可切換（文案以產品為準）：

| 模式 | 常見標籤 | 行為 |
|------|----------|------|
| **自動** | 自動 / 自動執行 | 直接修改畫布（排版、加元素、換色換圖等） |
| **詢問** | 詢問執行 | 先回答 / 出方案；需要改畫布時給出可確認的操作預覽，點「確認」後才落地 |
| **圖片** | 圖片生成 | 專注文生圖 / 參考圖生圖，可調解析度、比例、張數與模型 |
| **影片** | 影片生成 | 專注影片生成（以介面與模型列表為準） |

傳送後可隨時**停止**。長任務支援**暫停**與**繼續生成**（斷點續跑）；重新整理後若會話已同步，詢問模式下的待確認操作一般仍可點確認。

## 檢查點與還原

Agent 改畫布後，對話裡會出現**檢查點**：

| 操作 | 說明 |
|------|------|
| **撤銷** | 丟掉本輪畫布改動 |
| **保留** | 確認本輪結果 |
| **檢視** | 預覽該檢查點 |
| **撤銷到此步驟** | 將畫布恢復到該檢查點對應狀態 |



部分檢查點在**重新整理後可能失效**。重要結果請及時保留或匯出。

## 活動日誌

執行中可看到思考、查技能 / 規則 / 知識 / 美學、畫布尺寸、工具呼叫、出圖步驟等。

## 附件與 @ 引用

先用 **+** 上傳圖片，或在對話裡用 **Ctrl + V** 貼上。輸入 \`@\` 可搜尋並引用**當前對話中已新增的附件**，便於明確「按這張參考圖做」。

當前 \`@\` 面板不提供模型、專案或畫布節點搜尋。模型請透過輸入框下方的模型按鈕選擇；畫布選中內容可用 **Ctrl + Shift + L** 新增到對話。

## 模型選擇：Auto 與手動鎖定

點輸入框下方的**模型按鈕**開啟列表，常見分區為 **設計** / **圖片** / **影片**。

| 選擇方式 | 行為 |
|----------|------|
| **Auto** | 系統依本輪任務選「車道」，再對應到模型（見下方） |
| **指定平台模型** | 本輪鎖定該模型；Auto 車道設定會覆寫為同一模型 |
| **第三方自訂模型** | 使用自有 Key 與端點；**圖片 / 影片生成**一般不扣平台積分，**設計 Agent 改畫布**仍可能預扣平台積分（見 [自訂與第三方模型](/guide/custom-models)） |



免費檔通常僅可使用 **Auto**；標準檔及以上可自選平台模型。以帳戶「方案」頁為準。

生圖模型列表包含豆包 Seedream、GPT Image、Nano Banana Pro / Nano Banana 2 等（以產品內實際列表為準）。出圖細節見 [圖片生成](/guide/image-generation)。

## Auto 路由偏好

**僅當聊天模型為 Auto 時生效。** 可在兩處設定（同源配置，保存在本機）：

1. **帳戶設定 → Agent**（完整表單）
2. Agent / 詢問模式下模型彈層裡的 **Auto 路由** 卡片（精簡版）



### 偏好方案


| 偏好                     | 說明          |
| ---------------------- | ----------- |
| **標準版（Standard）**      | 平台預設車道表     |
| **Pro**                | 更強推理與看圖的車道表 |
| **Max**                | 旗艦檔，優先高質量   |
| **自訂車道（Custom lanes）** | 為每個車道單獨指定模型 |


選擇 Pro / Max / 自訂後，請求會帶上車道→模型對應（\`route_overrides\`）；選標準版則跟隨平台預設。

### 五個車道（自訂時逐項設定）

這不是「一次選中就立刻跑這個模型」，而是 **任務類型 → 模型** 的地圖。五個槽位不會同時呼叫。


| 車道                     | 含義                  | 典型場景         |
| ---------------------- | ------------------- | ------------ |
| **輕量（Fast lane）**      | 短問答、小改、不重做版面        | 「把標題改紅」      |
| **標準（Standard lane）**  | 常規畫布編輯              | 調佈局、換配色      |
| **推理（Reasoning lane）** | 空白從零、多畫板、設計系統、長/難多步 | 「從零做整站」      |
| **多模態（Multimodal）**    | 需要看懂附件 / 參考圖        | 依截圖仿製        |
| **生圖（Image model）**    | 文生圖模型槽（非聊天車道）       | 流水線需要 AI 出圖時 |


價格檔標籤僅供參考；實際是否呼叫取決於本輪被分到哪條車道。

### 後端如何判斷執行（摘要）

1. Auto 下前端附帶你的車道設定（或 Pro / Max 預設）。
2. 後端先**判定本輪車道**（廉價路由器；失敗則啟發式）：
  - 有圖且需理解參考 → **多模態**
  - 空白 / 長提示 / 從零 → **推理**
  - 短編輯 → **輕量**
  - 詢問且無圖 → 傾向 **輕量**
  - 其餘 → **標準**
3. 再查表得到模型；有圖但不支援看圖時，軟切到**多模態**槽位。
4. 文生圖走**生圖**槽位，並依張數扣平台積分（第三方聊天呼叫除外）。
5. 失敗重試可走平台 fallback；重試次數由平台限制。

手動鎖模時：輕量 / 標準 / 推理 / 多模態都釘到同一模型。

## 第三方大模型（自有 Key）

可在 **帳戶 → Agent → 第三方模型** 接入自有 Key：

- **平台目錄**：如 OpenRouter、火山方舟等，通常只需填 API Key。
- **手動填寫**：供應商名稱、模型 ID、請求位址；類型支援對話 / 多模態 / 圖片 / 影片。

網頁與雲端桌面一般需標準檔及以上；**桌面本地版**不強制會員，但沒有平台模型列表。

完整說明：**[自訂與第三方模型](/guide/custom-models)**。安裝與打包路徑：**[桌面端](/guide/desktop)**。

## 完整設計流程（首頁 / 開稿）

從首頁或 Agent 發起整頁設計時，還可選：

### 執行方式


| 方式            | 說明                  |
| ------------- | ------------------- |
| **Agent 流水線** | 技能鏈協作，後端依任務路由模型     |
| **單模型繪圖**     | 直接用指定模型出圖，不走完整技能流水線 |




### 協作節奏


| 節奏         | 說明            |
| ---------- | ------------- |
| **人際協同**   | 每階段停下確認（預設）   |
| **關鍵節點確認** | 只在重要里程碑暫停     |
| **完全自動**   | 一口氣做完（仍可隨時停止） |


場景類型包括網站、行動應用、圖像、海報 / Banner 等。

## 工作階段與活動

- 支援**新對話**與**歷史對話**（數量有上限）。
- 活動日誌可看到思考、查技能 / 規則 / 知識 / 美學、畫布尺寸、工具呼叫與出圖步驟。
- 免費檔每日有 Auto 試用；手動選模型可能受檔位限制。



## 積分與帳單

對話、Agent 與出圖共用統一積分。餘額、流水、方案與卡密見 [帳戶與積分](/guide/account)。`,co=`# 資產

編輯器左側的**資產**欄，用來集中查看本帳號下由 AI **生成並儲存**的媒體（圖片、影片等），方便再次拖到畫布使用。

入口：底部工具列（或左側區域）的**資產**圖示；開啟後可拖曳調整欄寬。

## 會出現什麼？

| 類型 | 說明 |
|------|------|
| **圖片** | 文生圖 / 圖生圖等生成成功後入庫的結果 |
| **影片** | 影片生成成功後的結果 |
| **音訊** | 若產品已接入音訊生成並入庫，也會出現在此（以實際為準） |

資產來自生成流程的自動歸檔，不是本機上傳庫。用圖像生成器、Agent「圖片 / 影片」模式等完成生成後，一般會出現在列表裡。

本機手動上傳到畫布的檔案，不會自動進資產欄。

## 怎麼用？

1. 開啟資產欄，必要時點**重新整理**。
2. **點擊**縮圖可預覽。
3. **拖到畫布**即可放置。
4. 懸停條目可**刪除**（請謹慎）。
5. 列表支援分頁**載入更多**。

改圖、去背景等仍在選中畫布節點後使用 [圖片編輯工具](/guide/image-tools)。

## 與畫布、圖層的區別

| | 資產欄 | 畫布 / 圖層 |
|--|--------|-------------|
| 內容 | 帳戶級生成結果庫 | 目前專案文件裡的節點 |
| 放到畫布 | 拖入後成為新節點 | 已在文件中 |
| 刪除資產 | 從資產庫去掉該條 | 不等於刪除畫布上已放置的副本 |

## 相關文件

- [圖片生成](/guide/image-generation)
- [畫布與工具](/guide/canvas)
- [Agent 用法](/guide/agent)
- [圖片編輯工具](/guide/image-tools)
`,lo=`# 音訊

可在畫布上放置**音訊生成器**（文生語音 TTS，或直接上傳本機音訊），並對音訊節點做截取、變速。生成結果會出現在左側 [資產](/guide/assets) 欄，可再拖回畫布。

## 音訊生成器

1. 畫布空白處**右鍵 → 生成器 → 音訊生成器**。
2. 選中節點後：
   - **TTS**：輸入要朗讀的文案，選擇可用的語音模型，點**生成**；
   - **上傳**：點**上傳音訊**（或 \`@\` 引用資產裡的音訊）後生成，可跳過 TTS。
3. 成功後節點原位變成**音訊節點**。

常見上傳格式：\`mp3\` / \`wav\` / \`ogg\` / \`m4a\` / \`aac\` / \`flac\` 等。工具列**上傳檔案**或拖放 \`audio/*\` 也可建立音訊節點。計費見 [帳戶與積分](/guide/account)。

## 音訊節點編輯

選中音訊後，工具列主要兩項（均會生成**副本**，不改原節點）：

| 操作 | 說明 |
|------|------|
| **截取** | 選定區間後確認，在旁生成「截取音訊」 |
| **變速** | 約 \`0.1×–4×\`，確認後生成「變速音訊」 |

## 相關文件

- [影片生成](/guide/video-generation)
- [資產](/guide/assets)
- [畫布與工具](/guide/canvas)
- [匯出與分享](/features/export-share)
`,uo=`# 畫布與工具

無限畫布支援多個**智慧畫板**；底部工具列切換工具，選中物件後會出現對齊、樣式、填色等操作。按 **C** 開啟 / 關閉右側 Agent；完整快捷鍵見 [快捷鍵](/guide/shortcuts)。

## 工具列

| 工具 | 快捷鍵 | 說明 |
|------|--------|------|
| 選擇 | V | 點選、框選；空畫布拖曳可平移 |
| 移動（手型） | H | 拖曳平移；也可按住 Space |
| 形狀 | R / L / O 等 | 矩形、線、箭頭、橢圓、多邊形、星形 |
| 鋼筆 | P | 錨點路徑；Esc / Enter 結束 |
| 畫筆 | Shift + P | 自由繪製；工具列可開**橡皮**；支援筆刷庫與自訂戳章 |
| 油漆桶 | B | 點擊形狀，用目前描邊色填色 |
| 文字 | T | 點擊新增文字；可改字型、字重、字級，支援 Markdown 編輯 |
| 智慧畫板 | F | 拖出畫板區域；之後可調尺寸預設、畫板色、鎖定、裁切溢出 |
| 圖片上傳 | I | 選擇本機圖片 / 影片放到畫布 |
| 圖像生成器 | A | 放置文生圖節點，見 [圖片生成](/guide/image-generation) |

## 智慧畫板

- 一個專案可有多個畫板；尺寸預設依場景（網站 / 行動 / 海報等）分組。
- 畫板工具列：尺寸預設、畫板顏色、鎖定、裁切溢出、翻轉等。
- **新建畫板會出現在圖層棧頂**；可用圖層面板或快捷鍵調整疊放。
- 匯出、分享預覽與廣場封面會優先使用目前 / 合適的畫板。

## 圖層

| 能力 | 說明 |
|------|------|
| 列表範圍 | 同時列出**畫板（Frame）**與形狀 / 文字 / 圖片等節點 |
| 搜尋 | 依名稱過濾 |
| 排序 / 疊放 | 拖曳或快捷鍵（與畫布 z 序一致） |
| 顯示 / 隱藏 | 眼睛圖示；畫板也可隱藏 |
| 鎖定 | 防止誤選誤改 |
| 命名 | 圖像生成器節點會顯示為「圖像生成器」一類名稱 |

快捷鍵：\`]\` / \`[\` 頂層 / 底層；\`Ctrl + ]\` / \`Ctrl + [\` 上移 / 下移；\`Ctrl + Shift + H\` 顯隱；\`Ctrl + Shift + K\` 鎖定。

左下角**小地圖**可定位視口；可開關網格吸附。

## 多選與對齊

框選或 Shift 點選後出現多選工具列：對齊、分布、統一尺寸等。單選時提供填色、描邊、圓角、混合模式、不透明度等。

## 填色與樣式

純色、線性漸層、徑向漸層、**彌散**（網格漸層，可調控制點）。

## 描邊

開路徑或可描邊形狀可於描邊面板調整線寬、對齊、線帽與線接。預設：

| 物件 | 線帽 | 線接 |
|------|------|------|
| 直線、鋼筆 | Butt | Miter |
| 畫筆、箭頭 | Round | Round |

面板可覆寫。閉合路徑通常不顯示線帽選項。

## 路徑編輯與輪廓化

- **雙擊**鋼筆 / 路徑節點進入路徑編輯；子工具含選擇、鋼筆追加錨點、曲線（對應 Alt / Option 轉換錨點）。
- **輪廓化**將描邊烘烤為可編輯填色路徑；單段開路徑採幾何偏移，多子路徑（如箭頭）取與繪製一致之外輪廓。鉛筆中線會先稀疏採樣。
- 輪廓化後，原描邊墨水寫入填色；直線 / 鋼筆 / 畫筆 / 箭頭不再疊加 SVG 描邊。

## 文字與字型

雙擊進入編輯；支援基礎 Markdown。可搜尋平台預置字型。可請 Agent 將圖中文字拆成可編輯圖層。

## 圖片相關

見 [圖片編輯工具](/guide/image-tools)。文生圖用 **A** 或 Agent「圖片」模式。

## 影片

- 可將本機影片拖入畫布或透過上傳入口新增；上傳中會顯示「上傳中」佔位。
- 選中後可剪輯、裁剪、翻轉、**提取幀**（首幀 / 目前位置）、全螢幕與下載。
- **提取幀**會在影片旁產生圖片節點，方便繼續用圖片工具編輯。
- 刪除「上傳中」佔位會中止上傳，且**無法用復原恢復**。

## 儲存與雲端同步

登入後自動同步；**Ctrl + S** 手動儲存。離開編輯器時會盡量同步文件與封面。詳見 [FAQ](/faq/)。

## 導航小提示

空白鍵 / 手型平移；滾輪縮放；Ctrl + 0：100%；Shift + 1：適合全部內容。
`,fo=`# 自訂與第三方模型

你可以在 recombyn 裡接入**自己的 API Key**（BYOK），用相容 OpenAI / Claude 風格的第三方服務，而不是只走平台內建模型。

入口：**帳戶設定 → Agent → 第三方模型**。儲存後，模型會出現在對話區底部的**模型列表**裡，可直接選用。

## 誰可以新增？

| 環境 | 條件 |
|------|------|
| **網頁 / 雲端桌面** | 一般需 **標準檔（Plus）及以上**會員；未開通時介面會提示升級 |
| **桌面端本機版** | 不依賴平台會員；本機版本身沒有平台模型目錄，**需要自己配第三方 Key** 才能對話 / 出圖 |

## 兩種新增方式

開啟「第三方模型」後，先選**供應商**：

### 1. 平台目錄（推薦）

列表裡會有內建平台（如 **OpenRouter**、**火山方舟 / 豆包** 等，以產品內實際為準）。

1. 選中某個平台。
2. 一般**只需貼上 API Key**（請求位址、常用模型會自動填好）。
3. 點儲存。儲存後，該平台在目錄裡已接入的對話 / 圖片 / 影片模型，會出現在模型選擇列表中。

部分平台還支援 **「新增模型」**：在已儲存 Key 的前提下，把目錄裡沒有的模型 ID 補進列表（需填模型 ID、顯示名稱、圖示、分類：對話 / 多模態 / 圖片 / 影片）。

### 2. 手動填寫

選 **「手動填寫」**，自己配任意相容端點：

| 欄位 | 說明 |
|------|------|
| **模型類型** | **對話**：聊天改稿；**多模態**：可看參考圖；**圖片**：文生圖 / 圖生圖類介面；**影片**：影片生成類介面 |
| **供應商名稱** | 顯示用 |
| **官網連結** | 可選 |
| **模型 ID** | 上游介面裡的 \`model\` 欄位 |
| **API Key** | 供應商發給你的密鑰 |
| **請求位址** | 相容端點，需以 \`http://\` 或 \`https://\` 開頭，**不要**以 \`/\` 結尾 |

## 在哪裡選用？

1. 開啟編輯器右側 Agent 面板。
2. 點輸入框下方的**模型按鈕**。
3. 列表分區一般為 **設計** / **圖片** / **影片**（以介面為準）。

## 計費與積分（以實際扣費為準）

接入自有 Key 後，**上游費用走你自己的供應商額度**；平台積分是否還扣，取決於走哪條能力：

| 能力 | 平台積分 |
|------|----------|
| **圖片 / 影片生成**（生成器節點、對話裡的圖片·影片模式等，且選用的是你的 BYOK / 平台目錄 Key） | **不扣**平台積分 |
| **設計 Agent 改畫布**（「自動」等會預扣並按用量結算的路徑） | **仍會**占用平台積分（預扣 / 結算），即使本輪模型是第三方 |

免費檔通常只能用 Auto；自選平台模型與第三方一般需會員（本機桌面版除外）。平台模型與圖片工具的計費見 [帳戶與積分](/guide/account)。


## 密鑰如何儲存

- 網頁登入態下，Key 可能加密存入帳戶側的**保險箱**，供服務端代你請求上游（仍是你的 Key）。
- 也會在本機保留一份設定；清除站點資料或清空本機桌面應用資料後，可能需要重新新增。
- 請勿把 Key 發到公開 Issue / 群聊。

## 常見問題

**儲存按鈕是灰的 / 提示要開通會員？**  
網頁與雲端桌面需標準檔及以上。本機桌面版一般可直接儲存。

**儲存了但列表裡看不到？**  
確認已點「儲存供應商」；重新整理後再開啟模型列表。手動填寫時檢查模型 ID 與請求位址。

**選了第三方模型，為什麼還扣平台積分？**  
若本輪是**設計 Agent 改畫布**，平台仍會預扣 / 結算積分。純 BYOK **圖片·影片生成**一般不扣平台積分。


**本機桌面沒有 Seedream 等平台模型？**  
正常。本機版不展示平台 LLM 目錄，請按本文新增 OpenRouter / 方舟或手動端點。詳見 [桌面端](/guide/desktop)。

## 相關文件

- [Agent 用法](/guide/agent)
- [帳戶與積分](/guide/account)
- [桌面端](/guide/desktop)
- [圖片生成](/guide/image-generation)
- [圖片編輯工具](/guide/image-tools)
`,po=`# 桌面端

recombyn 提供 **Tauri** 桌面應用，有兩種口味：

| 版本 | 用途 | API |
|------|------|-----|
| **Local（本地版）** | 資料與模型都在本機 | 內嵌 API（SQLite），本機 \`127.0.0.1:8000\` |
| **Cloud（雲端版）** | 桌面殼 + 線上帳號 | 預設 \`https://recombyn.com\` |

## 本地版 vs 雲端版

| | 本地版 | 雲端版 |
|--|--------|--------|
| 登入 | 系統使用者**自動登入** | 與網頁相同 |
| 專案資料 | 本機 SQLite | 雲端同步 |
| 平台模型目錄 | **不提供** | 與網頁一致 |
| 第三方模型 | **必配**才能對話 / 出圖 | 標準檔及以上可配 |
| 方案 / 卡密 / 餘額 | 介面**隱藏**（平台積分關閉） | Cloud 開啟積分時與網頁一致 |
| 對話 / 出圖 / 圖片工具錢包 | **不扣**平台積分 | 與網頁一致 |

設定第三方模型見 [自訂與第三方模型](/guide/custom-models)。自託管預設同樣關閉平台積分（\`WALLET_BILLING_ENABLED=false\`），見 [帳戶與積分](/guide/account#何時看不到積分--方案)。

## 開發與打包（指令）

\`\`\`bash
npm run dev:desktop
npm run dev:desktop:cloud
npm run build:desktop:sidecar
npm run build:desktop
npm run build:desktop:cloud
\`\`\`

## 打包產物路徑

| 產物 | 路徑 |
|------|------|
| 安裝包（NSIS / MSI 等） | \`apps/web/src-tauri/target/release/bundle/\` |
| 未打包主程式 | \`apps/web/src-tauri/target/release/recombyn.exe\` |
| API 邊車（建置暫存） | \`apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe\` |

更細的工程說明見倉庫 \`docs/desktop.md\`。

## 相關文件

- [自訂與第三方模型](/guide/custom-models)
- [帳戶與積分](/guide/account)
- [快速入門](/guide/getting-started)
- [常見問題](/faq/)
`,mo=`# 快速入門

歡迎使用 **recombyn**：用自然語言描述目標，在無限畫布上生成、調整海報、介面與圖形，並保留可繼續編輯的結構。

## 第一步：登入賬號

1. 開啟 [recombyn.com](https://recombyn.com)。
2. 使用郵箱驗證碼或 Google 登入。
3. 登入後即可使用首頁、專案庫與編輯器。

首次登入會建立賬戶；對話 / Agent / 出圖共用統一積分。

## 第二步：瞭解工作臺

| 區域 | 作用 |
|------|------|
| 首頁 | 選品類、發需求、匯入檔案、看靈感與最近專案 |
| 編輯器畫布 | 無限畫布 + 多畫板，手動改稿與圖片工具 |
| 右側 Agent | 自動 / 詢問 / 圖片 / 影片；可選 Auto 路由 |
| 賬戶 | 方案、積分、個人資料與通知 |

## 第三步：建立第一個專案

任選一種方式：

- **首頁發需求**：選海報 / 移動應用 / 網站 / 圖片，描述目標後傳送 → 進入編輯器並由 Agent 開稿（可調協作節奏與執行方式）。
- **空白畫布**：側欄「+」建立空專案，再自己畫或按 **C** 喚起 Agent。
- **靈感案例**：在 [廣場](/features/plaza) 開啟案例，複製到自己的專案繼續改。
- **匯入檔案**：圖片轉為可編輯畫布，見 [匯入檔案](/features/import)。

## 第四步：用 Agent 或生成器改稿

1. 右側輸入框描述修改（例如「標題改大一點，主色換成深藍」）；模式選 **Agent** 直接改畫布，或 **詢問** 先看方案。
2. 需要純出圖時：模式選 **圖片**，或按 **A** 放置 [影象生成器](/guide/image-generation)。
3. 先上傳或貼上圖片，再用 \`@\` 引用當前對話中的附件；模型透過模型按鈕選擇 **Auto** 或手動指定。
4. 生成過程中可隨時停止；結果落在畫板上後仍可手改，或用 [圖片編輯工具](/guide/image-tools) 摳圖、擴圖、多角度等。

賬戶裡可將 Auto 偏好設為 **標準版 / Pro / Max / 自訂車道**；會員還可新增第三方模型。詳見 [Agent 用法](/guide/agent) 與 [帳戶與積分](/guide/account)。

## 第五步：匯出與分享

- **Export**：按畫板或選區匯出 PNG / JPG / SVG 等，可選倍率與匯出全部頁面。
- **Share**：生成連結；預覽連結無需登入，可編輯連結需登入後儲存。詳見 [匯出與分享](/features/export-share)。

## 新手提示

- 免費檔每天有 Auto 試用；更多額度見「方案」與卡密兌換。
- 作品會雲端同步；離開編輯器時會自動儲存文件與封面。
- 常用鍵：空格平移、滾輪縮放、**C** 開關 Agent、**A** 影象生成器；完整列表見 [快捷鍵](/guide/shortcuts)。
- 卡住時先看 [FAQ](/faq/)；法律與隱私見 [服務條款](/legal/terms)。
`,ho=`# 圖片生成

recombyn 提供兩種常用出圖方式：**畫布上的影象生成器節點**，以及 **Agent 對話裡的「圖片」模式**。二者共享解析度、比例、張數與模型設定。

## 影象生成器節點

1. 底部工具欄點 **影象生成器**，或按快捷鍵 **A**。
2. 視口中央會出現生成器卡片；**僅選中該節點**時顯示輸入框。
3. 輸入提示詞；可用 **+** 上傳參考圖，或用 \`@\` 引用已有附件。
4. 點選設定晶片調整：**解析度 · 比例 · 張數**（例如 \`2K · 1:1 · 1張\`）。
5. 選擇生圖模型，確認積分後傳送。

生成成功後，節點會變成普通圖片節點；若一次生成多張，額外結果會進入該圖的**多圖變體**，可切換主圖或拆成獨立節點。失敗時會提示「影象生成失敗」或「未返回圖片」，可改提示詞 / 模型後重試。

### 常用設定

| 項 | 選項 |
|----|------|
| 解析度 | 標清 1K / 高畫質 2K / 超清 4K |
| 比例 | 智慧、21:9、16:9、3:2、4:3、1:1、3:4、2:3、9:16 |
| 數量 | 1–4 張 |
| 智慧比例 | 由模型根據內容確認比例 |

積分消耗會顯示在傳送按鈕旁（閃電圖示 + 數字），以當前所選模型與張數為準。

## Agent「圖片」模式

右側對話底部可切換互動模式（含自動 / 詢問 / 圖片 / 影片，以產品為準）：

| 模式 | 說明 |
|------|------|
| **Agent** | 直接改畫布：排版、加元素、換圖等 |
| **詢問**（Ask） | 先回答 / 出方案；需要改畫布時給出可確認的操作預覽，點「確認」後才落地 |
| **圖片**（Image） | 專注文生圖 / 參考圖生圖，控制元件與生成器節點類似 |

在「圖片」模式下描述畫面、附上參考圖，即可在對話中出圖並落到畫布。首頁發需求時也可選圖片類場景，由完整設計流程開稿。

## 參考圖與 @ 引用

- **參考圖**：上傳本地圖，或貼上到對話（Ctrl + V）。
- **@**：從當前對話中已新增的附件裡選擇引用，方便明確「按這張參考繼續」。
- **模型**：透過輸入框下方的模型按鈕單獨選擇，不在 \`@\` 面板中。

選中已有圖片後，工具欄上的 **Chat** 可對該圖做圖生圖修改（見 [圖片編輯工具](/guide/image-tools)）。

## 與完整設計流程的關係

從首頁發起「網站 / 移動應用 / 海報」等完整稿時，除互動模式外還有：

- **執行方式**：Agent 流水線（技能鏈 + 自動路由）或單模型繪圖。
- **協作節奏**：人際協同 / 關鍵節點確認 / 完全自動（見 [Agent 用法](/guide/agent)）。

純出圖場景優先用生成器節點或 Agent「圖片」模式即可。
`,go=`# 圖片編輯工具

選中畫布上的**圖片節點**後，頂部會出現圖片工具條。多數 AI 能力會在確認前顯示本次積分消耗。

## 主工具條

| 工具 | 作用 |
|------|------|
| **Chat** | 對該圖做提示詞編輯（圖生圖）；可帶參考圖、選模型與解析度 |
| **放大** | 超分到預設 **4K** 或 **8K** |
| **去背景** | 摳圖；可選「人像/細發」或「產品/硬邊」 |
| **橡皮工具** | 畫筆塗抹遮罩，確認後擦除對應畫素 |
| **多角度** | 調整視角後重生（見下） |
| **更多 …** | 擴充套件、調整、裁剪、翻轉與旋轉 |
| 混合 / 不透明度 | Photoshop 風格混合模式 |
| 圓角 | 支援圓角的圖片可調圓角 |
| 匯出 / 全屏預覽 | 單節點匯出或全屏檢視 |

## 更多選單

| 操作 | 說明 |
|------|------|
| **擴充套件** | 向外擴畫 / 外延，適合補背景、加留白 |
| **調整** | 光線、曝光、對比度、高光/陰影、白黑場；飽和度、色溫、色調；含自動預設 |
| **裁剪** | 畫布上拖裁剪框 |
| **翻轉與旋轉** | 水平/垂直翻轉與角度 |

裁剪與擴充套件會進入畫布上的會話式編輯，確認後寫回節點。

## 多角度

面板內分 **天空盒** / **攝像頭**：

- 預設：正面、側面、反打、斜側、俯視、仰視等
- 滑桿：旋轉、傾斜、縮放（近 / 中 / 遠）
- 確認「立即使用」後按積分出圖並替換當前圖

## Chat 快速改圖

1. 選中圖片 → **Chat**。
2. 輸入修改說明（例如「換成暖色燈光」「去掉背景雜物」）。
3. 可選參考圖、模型與張數；當前圖會作為主參考。
4. 生成中顯示「修改中」；結果寫回節點（多張進入變體）。

若該圖曾由 AI 生成，輸入框可能預填當時的提示詞，便於微調。

## 多圖變體

一次生成多張時，節點上會顯示「N 張圖」：

- **檢視全部**：展開全部結果
- **設為主圖**：指定當前顯示的那一張
- **單獨成節點**：把某張拆到畫布上獨立編輯

## 參考積分（工具）

| 工具 | 約計積分 |
|------|----------|
| 去背景 | 10 |
| 放大 | 20 |
| 調整 | 20 |
| 擴充套件 | 30 |
| 多角度 | 30 |

以下為雲端預設參考價；**先扣費再執行**，失敗時目前實作**不一定自動退回**。橡皮擦等純本機編輯一般不走該介面。文生圖 / 圖生圖按模型與張數另行計費。詳見 [FAQ](/faq/) 與 [帳戶與積分](/guide/account)。

## Agent 相關能力

部分能力主要透過 Agent 工具呼叫，例如把圖中文字拆成可編輯圖層（**編輯文字**）。用自然語言描述即可，不必記工具入口。
`,_o=`# Lottie 動畫

可在畫布上用 **Lottie 生成器**做短動畫，或直接上傳 **Lottie JSON**。生成 / 上傳後都是可播放的 **Lottie 動畫**節點。

> Lottie 結果**不會**進入左側「資產」庫（資產目前主要為圖片 / 影片 / 音訊）。請在畫布或匯出 JSON 中管理。

## Lottie 生成器

1. 畫布空白處**右鍵 → 生成器 → Lottie 生成器**。
2. 輸入創作說明；可上傳**參考圖**。
3. 在 **Lottie 設定**中調比例與時長，選模型後點**生成**。
4. 成功後原位變成 **Lottie 動畫**節點。

| 項 | 選項（以產品為準） |
|----|-------------------|
| 比例 | 1:1（常見預設）、16:9、9:16、4:3、3:4 |
| 時長 | 約 1 / 2 / 3 / 5 / 8 / 10 秒（常見預設 3 秒） |

## 上傳現成 JSON

工具列**上傳檔案**、畫布拖放或貼上 \`.json\` 時，會嘗試解析為 Lottie 節點。無效檔案會提示「無效的 Lottie JSON」。

## Lottie 節點工具列

| 操作 | 說明 |
|------|------|
| **播放 / 暫停** | 預覽動畫 |
| **循環** | 是否循環播放 |
| **速度** | 常見 \`0.5× / 1× / 1.5× / 2×\` |
| **替換** | 上傳新的 \`.json\` |
| **下載 / 匯出** | 匯出 Lottie JSON；僅選中 Lottie 時頂欄匯出格式為 **JSON** |

## 相關文件

- [圖片生成](/guide/image-generation)
- [影片生成](/guide/video-generation)
- [畫布與工具](/guide/canvas)
- [匯出與分享](/features/export-share)
`,vo=`# 快捷鍵

編輯器內可開啟快捷鍵面板檢視完整列表（Mac 顯示 ⌘，Windows / Linux 為 Ctrl）。下列為常用繫結。

## 畫布導航

| 操作 | 快捷鍵 |
|------|--------|
| 平移畫布 | Space + 拖拽（或手型工具 H） |
| 空畫布拖拽平移 | 選擇工具下拖拽空白處 |
| 滾輪縮放 | 滾輪 |
| 縮放至 100% | Ctrl + 0 |
| 放大 / 縮小 | Ctrl + + / Ctrl + - |
| 縮放以適合所有內容 | Shift + 1 |
| 儲存專案 | Ctrl + S |

## 工具切換

| 操作 | 快捷鍵 |
|------|--------|
| 選擇 | V |
| 手型（平移） | H |
| 智慧畫板 | F |
| 文字 | T |
| 鋼筆 | P |
| 畫筆 | Shift + P |
| 油漆桶 | B |
| 矩形 | R |
| 線條 | L |
| 箭頭 | Shift + L |
| 橢圓 | O |
| 上傳圖片 | I |
| 影象生成器節點 | A |
| 開啟 / 關閉 Agent 面板 | C |
| 退出路徑編輯 / 關閉面板 | Esc |

## 節點編輯

| 操作 | 快捷鍵 |
|------|--------|
| 複製 / 剪下 / 貼上 | Ctrl + C / X / V |
| 建立副本 | Ctrl + D |
| 全選（選擇工具下） | Ctrl + A |
| 撤銷 | Ctrl + Z |
| 重做 | Ctrl + Shift + Z（或 Ctrl + Y） |
| 刪除選中 | Delete（Backspace 留給文字編輯） |

## 圖層排列

| 操作 | 快捷鍵 |
|------|--------|
| 移至頂層 / 底層 | ] / [ |
| 上移 / 下移一層 | Ctrl + ] / Ctrl + [ |
| 顯示 / 隱藏選中圖層 | Ctrl + Shift + H |
| 鎖定 / 解鎖選中圖層 | Ctrl + Shift + K |

## 對話（Agent）

| 操作 | 快捷鍵 |
|------|--------|
| 開啟 / 關閉 Agent | C |
| 輸入 @ 選擇已新增的附件 | @ |
| 貼上圖片或內容到對話 | Ctrl + V |
| 將畫布選中內容新增到對話 | Ctrl + Shift + L |
| 傳送訊息 | Enter |
| 插入換行 | Shift + Enter |
| 取消編輯 / 關閉面板 | Esc |

## 小提示

- 鋼筆 / 路徑編輯可用 **Enter** 或 **Esc** 結束；路徑編輯工具列可切換選擇 / 鋼筆 / 曲線後確認完成。
- 文字內聯編輯中 **Esc** 退出編輯。
- 多圖變體展開、快捷鍵面板等浮層也可用 **Esc** 關閉。
`,yo=`# 技能（Skills）

**技能**是可啟用的能力包：官方內建或你自己上傳的 \`.zip\`。啟用後，Agent / 對話可按技能說明協作；也可在輸入框用 \`/\` **為本回合固定**某個 Skill。

## 開啟技能工具箱

首頁左側軌道點 **「技能」**，進入**技能工具箱**。

| 分區 | 說明 |
|------|------|
| **官方** | 平台提供的技能；可按需關閉不需要的項 |
| **我的** | 你上傳的個人技能；可啟用、預覽說明、刪除 |

## 上傳個人 Skill

1. 在「我的」中點**上傳 Skill**，選擇 \`.zip\` 技能包。
2. 上傳後會進入**安全檢測**；通過後才會出現在列表。
3. 若與已有 Skill **同名**，可選擇覆蓋並更新。

## 在對話裡使用 \`/\`

1. 開啟編輯器右側 Agent 面板。
2. 在輸入框輸入 **\`/\`**，搜尋並選擇 Skill。
3. 選中後會以晶片形式**固定到目前回合**。

提示：輸入 \`@\` 用於附件 / 引用；\`/\` 用於 Skill。詳見 [Agent 用法](/guide/agent)。

## 相關文件

- [Agent 用法](/guide/agent)
- [快速入門](/guide/getting-started)
- [自訂與第三方模型](/guide/custom-models)
`,bo=`# 影片生成

可用兩種方式生成影片：**畫布上的影片生成器節點**，以及右側 Agent 的**「影片」模式**。設定項（比例、解析度、時長、模型）大致一致。

## 影片生成器節點

1. 畫布空白處**右鍵 → 生成器 → 影片生成器**（工具列「圖像生成器」只放圖像節點）。
2. 選中該節點後輸入描述。
3. 用設定晶片調整**比例 · 解析度 · 時長**，並選擇影片模型；傳送旁會顯示預計積分。
4. 可用 **+** 或 \`@\` 附加**參考圖**（也可掛影片附件；發給模型的參考以圖為主）。
5. 點**生成**。成功後節點**原位變成影片節點**並保持選中。

### 常用設定

| 項 | 選項（以產品為準） |
|----|-------------------|
| 比例 | 16:9（常見預設）、9:16、1:1、4:3、3:4 |
| 解析度 | 480p、720p（常見預設）、1080p |
| 時長 | 約 4–15 秒（常見預設 5 秒） |

平台影片模型按規則扣**平台積分**；第三方影片類型 Key 一般不扣平台積分（見 [自訂與第三方模型](/guide/custom-models)）。

## Agent「影片」模式

右側對話切換到**影片**。結果會出現在對話裡的**可播放影片**區域。若要從資產庫再放到畫布：開啟左側 [資產](/guide/assets)，找到對應**影片**條目後拖入畫布。生成成功後通常會寫入資產庫。

## 畫布上的影片節點

| 能力 | 說明 |
|------|------|
| 剪輯 / 裁切 | 調整片段與畫面範圍 |
| 提取幀 | 首幀或目前位置生成旁側圖片節點 |
| 全螢幕 / 下載 | 預覽與本機下載 |
| 匯出 | 僅影片選中時可選 **MP4**，或匯出音軌為 **MP3**（見 [匯出與分享](/features/export-share)） |

也可透過工具列**上傳檔案**或拖放本機 \`video/*\` 到畫布。上傳中占位被刪除會中止上傳，且不可撤銷恢復。

## 相關文件

- [圖片生成](/guide/image-generation)
- [資產](/guide/assets)
- [Agent 用法](/guide/agent)
- [畫布與工具](/guide/canvas)
- [匯出與分享](/features/export-share)
`,N=`# 關於我們

**用對話做出可編輯的設計。**

recombyn 是一款設計 Agent：你用自然語言描述目標，它在無限畫布上生成、調整海報、介面與圖形，並保留可繼續編輯的結構。

## 它是什麼

把「說清楚想要什麼」變成可落地的設計稿。你也可以隨時手動改節點、換圖、調字體。

## 個人開發

由獨立開發者在業餘時間打造，目標是讓「用對話做設計」真正好用。

如果你願意支持這個專案繼續迭代，歡迎看看 [贊助頁](/sponsor)（自願，無強制）。

## 你能做什麼

匯入參考圖；發布廣場；分享預覽 / 協作連結；完整流程自動或關鍵節點確認。

## 方案與計費

免費檔每日 Auto 試用；付費檔月度統一積分，並可解鎖模型自選與第三方模型等。詳見 [帳戶與積分](/guide/account)。

## 回饋

歡迎透過帳戶設定裡的**通知公告**與回饋入口告訴我們。

## 禁止套殼與仿冒

recombyn 採用源碼可得協議：個人自用與組織內部部署可以，**未經授權不得**換皮售賣、對外做成公眾註冊的託管服務，或冒充官方品牌 / 官網 / 客服。

- 官方網站：[recombyn.com](https://recombyn.com)
- 說明文件：[快速入門](/guide/getting-started)
- 原始碼倉庫：[github.com/recombyn/recombyn](https://github.com/recombyn/recombyn)

發現仿冒或違規託管，請寄信至 \`702680355@qq.com\`（附連結與截圖）。詳見倉庫 [LICENSE](https://github.com/recombyn/recombyn/blob/main/LICENSE)。

## 相關連結

- [開始創作](https://recombyn.com)
- [快速入門](/guide/getting-started)
- [服務條款](/legal/terms)
- [隱私政策](/legal/privacy)
- [AI 服務說明](/legal/ai-terms)
`,xo=`# AI 服務說明

> 最近更新：2026年7月28日

本說明是 [服務條款](/legal/terms) 的補充。操作說明見 [Agent 用法](/guide/agent)、[圖片生成](/guide/image-generation)、[圖片編輯工具](/guide/image-tools)。

## 1. AI 能力範圍

包括但不限於：對話式設計 Agent、文生圖 / 圖生圖與圖片編輯、**Auto** 路由與使用者偏好（標準 / Pro / Max / 自訂車道）、會員可用的**第三方相容端點**（自有 API Key）。以產品內實際提供為準。

## 2. 平台模型與第三方模型

**平台模型**：必要提示詞、參考圖與脈絡可能送至服務商按其政策處理。

**自有 Key（BYOK）**：網頁登入時 Key 可能加密存入帳戶保險箱；亦可能保留本機設定。請求發往你指定的服務。平台不保證第三方端點可用性或品質。

## 3. Auto 路由

系統可能先判定任務車道再對應模型；生圖可走獨立槽位。路由與重試由平台管理。詳見 [Agent 用法](/guide/agent#auto-路由偏好)。

## 4. 輸出與審核

AI 輸出可能不準確或不完整。正式使用前請自行審核。你對最終採用內容負責。

## 5. 禁止用途

不得產生違法、侵權、詐欺、仇恨或有害內容；不得繞過安全、配額或計費；不得接入未授權金鑰或端點。

## 6. 內容歸屬

適用服務條款「使用者內容」。模型服務商可能依其政策保留請求日誌。

## 7. 積分與費用

平台模型可能消耗統一積分；BYOK 圖片 / 影片生成一般不扣平台積分，但設計 Agent 改畫布仍可能預扣。你須承擔供應商費用。同流程中的平台生圖 / 圖片工具仍按平台計費。見 [帳戶與積分](/guide/account)。

## 8. 變更

我們可能增減模型、調整路由或配額。重大變更盡量透過產品內說明或通知公告告知。
`,So=`# 隱私政策

> 最近更新：2026年7月28日

> 當你向 **recombyn** 提供輸入時，請勿提交你本人或他人的敏感個人資訊（如身分證件號碼、精確住址、財務帳戶、健康資訊等）。

## 1. 我們收集的資訊

為提供服務，我們可能收集：

| 類別 | 示例 |
|------|------|
| **帳戶** | 信箱、顯示名、簡介、頭像、登入方式（信箱 / Google） |
| **工作階段與安全** | 登入態、驗證碼相關記錄、必要的安全日誌 |
| **專案內容** | 畫布文件、上傳圖片、專案封面 |
| **用量與計費** | 積分餘額與流水、方案資訊、卡密兌換結果 |
| **協作與分享** | 分享連結設定、協作者標識（你主動新增的使用者名稱 / 信箱 / ID） |
| **廣場** | 你提交發布的作品中繼資料與封面、審核相關資訊 |
| **產品通訊** | 你主動提交的回饋；帳戶內通知 / 公告的已讀狀態 |
| **診斷** | 介面錯誤、效能與防濫用相關日誌 |

若使用 Google 等第三方登入，我們會取得你授權範圍內的基本資料。

## 2. 資訊如何使用

用於：建立與維護帳戶、儲存與渲染設計、提供 AI 輔助、計費與積分核銷、協作分享與廣場展示、安全防護與防濫用、發送產品公告 / 通知、改進產品體驗。

## 3. 本機儲存（瀏覽器）

部分資料**僅保存在你的裝置本機**，例如：

- **第三方模型 API Key** 與自訂供應商設定（自有 Key）
- **Auto 路由偏好**（標準 / Pro / Max / 自訂車道對應）
- 語言、主題與部分 UI 偏好

清除瀏覽器網站資料會遺失上述本機設定。請勿在共用電腦上儲存敏感 Key。

## 4. 儲存與安全

雲端資料可能儲存在我們設定的伺服器、資料庫或物件儲存中。頭像與專案封面等會以 URL 引用雲端物件。我們採取合理措施保護資料，但無法保證絕對安全。

## 5. 第三方服務

可能依賴雲服務、平台側大模型 API、登入提供方、支付 / 發卡管道等。

- **平台模型**：必要提示詞、參考圖與畫布脈絡可能送至模型服務商，按其政策處理。
- **你設定的第三方端點（BYOK）**：請求發往**你指定的供應商**；其如何處理資料受其政策約束。請只新增你信任的端點。

## 6. 廣場、分享與協作

發布到廣場、開啟分享連結或邀請協作者時，相關內容可能對其他使用者、持有連結者或受邀者可見。預覽連結可能無需登入即可檢視。

## 7. Cookie 與同類技術

我們使用 Cookie / localStorage 記住登入、語言、主題、路由偏好等。清除後可能需重新登入或遺失本機偏好（含第三方 Key）。

## 8. 你的選擇

可更新資料、管理專案與分享權限、清除本機偏好，或聯絡我們處理帳戶相關請求。在適用法律允許範圍內，可要求查閱、更正或刪除相關個人資訊。

## 9. 未成年人

本服務主要面向具備完全民事行為能力的使用者。未滿當地法定年齡者，請在監護人同意與指導下使用。

## 10. 政策更新

我們可能更新本隱私政策。重大變更將盡量透過產品內提示或通知公告告知。繼續使用即表示你知悉更新後的政策。

## 11. 聯絡我們

隱私相關問題，請見 [關於我們](/legal/about)。
`,Co=`# 服務條款

> 最近更新：2026年7月28日

歡迎使用 recombyn（以下簡稱「本服務」）。造訪或使用本服務，即表示你已閱讀並同意本服務條款。若不同意，請停止使用。

## 1. 接受條款

使用本服務即表示你同意受本條款約束。我們可能與 [隱私政策](/legal/privacy)、[AI 服務說明](/legal/ai-terms) 一併適用。說明文件若與本條款衝突，以本條款為準。

## 2. 服務說明

包括但不限於：無限畫布與多智能畫板、Agent / 詢問 / 圖片模式、文生圖與圖片編輯、Auto 模型路由、第三方相容模型（自有 Key）、檔案匯入、匯出與分享協作、靈感廣場等。功能可能隨產品迭代調整。

## 3. 帳戶與安全

你須對帳戶憑證與登入行為負責。本機保存的第三方 API Key 由你自行保管；因 Key 外洩導致的供應商側費用或損失，由你自行承擔。

## 4. 使用者內容

你上傳、建立或發布的內容歸你所有。你授予我們為提供服務所必需的有限處理與展示許可。請確保你有權使用相關素材。

## 5. 合理使用

禁止違法違規、侵權、繞過計費或配額、攻擊系統或濫用自動化請求、利用 AI 產生違法或有害內容。我們可在合理範圍內限制、暫停或終止違規帳戶。

## 6. 積分、方案與卡密

- 對話 / Agent / 平台出圖與部分圖片工具可能消耗**統一積分**。
- 使用自有 Key 時：圖片 / 影片生成一般不扣平台積分；設計 Agent 等路徑仍可能占用平台積分。供應商側費用由你自行承擔。
- 卡密兌換一經完成，除法律法規要求或我們明確承諾外，通常不支援無理由退款。

詳見 [帳戶與積分](/guide/account)。

## 7. 分享與協作

你可透過連結分享（預覽或可編輯）並邀請協作者。請自行控制公開範圍。協作者須遵守本條款。

## 8. 免責聲明

本服務按「現狀」提供。不對中斷、資料遺失、第三方模型錯誤、你所接第三方端點可用性作保證。AI 輸出可能不準確；瀏覽器本機檢查點可能在重新整理後失效。

## 9. 責任限制

在法律允許的最大範圍內，對間接或衍生損失不承擔責任。與付費相關的責任上限不超過你就該爭議事項已支付的金額。

## 10. 條款變更

更新後繼續使用即視為接受。重大變更將盡量透過頁面提示或通知公告告知。

## 11. 聯絡我們

見 [關於我們](/legal/about) 或購買卡密時的聯絡方式。
`,wo=`# Sponsor recombyn

Hi — I’m the solo developer behind recombyn.

I used to be a programmer too — though maybe not the typical story. No strong academic background, no impressive résumé; just an ordinary developer at the bottom of the stack. I’ve done outsourcing, been through layoffs, and run into my share of cold shoulders. And here I am unemployed again — laid off, haha. I’ve looked for a long time and still can’t find anything that fits; that’s fair enough — the world is full of excellent people. For a while I didn’t know what to do, so I decided to make something of my own. That’s how recombyn started.

There’s no team and no fundraising story. Building alone means the product still has gaps — stability, polish, documentation, and how to keep going long term. I’ve thought about raising capital, but the process is heavy; becoming a formal SaaS also means licenses and compliance that are hard for one person to carry.

There’s no forced plan here, and nothing like “sponsor or you can’t use it.”  
If the project helped you — or you’d like to support an indie developer who’s still at it — **voluntary support** is enough.

Thank you for reading this far.

## Community

Sponsorship isn’t buying a feature pack. It helps this small project last longer: fix bugs, ship capabilities, and respond to feedback. Using it, sharing it, or opening an issue helps too.

## How to sponsor

Scan with Alipay or WeChat Pay. Any amount is appreciated — even a little.

<div class="sponsor-qr-grid">

<div class="sponsor-qr-card">

**Alipay**

![Alipay QR](/sponsor/alipay.png)

</div>

<div class="sponsor-qr-card">

**WeChat Pay**

![WeChat Pay QR](/sponsor/wechat.png)

</div>

</div>

> Please verify the payee shown in your app. Sponsorship is voluntary support and does not create a service contract or entitlement.

## Other ways to help

- ⭐ Star the repo on [GitHub](https://github.com/recombyn/recombyn)
- Tell a friend who might need it
- Send product feedback from inside the app

## Links

- [Start creating](https://recombyn.com)
- [Getting started](/guide/getting-started)
- [About](/legal/about)
`,To=`# recombyn を支援する

Hi。私は recombyn の個人開発者です。

かつては私もプログラマーでした。ただ多くの開発者と少し違って、華やかな学歴もなく、立派な職歴もなく、いちばん普通の底辺寄りの一人でした。アウトソーシングも経験し、リストラも経験し、冷たい視線も浴びてきました。こうしてまた失業しています——また最適化、というやつで、はは。長く仕事を探しましたが、合うものは見つからないようです。まあ普通ですね、この世界には優秀な人がたくさんいますから。しばらく何をすればいいかわからず、自分で何か始めようと思って作ったのが recombyn です。

チームもなく、資金調達の話もありません。一人で進めている以上、安定性や体験、ドキュメント、これからどう続けていくかなど、足りない点は自分でも分かっています。資金調達も考えましたが負担が大きく、本格的な SaaS にするには資格やコンプライアンスのコストが個人には重いです。

ここには強制プランも「スポンサーしないと使えない」もありません。  
もしこのプロジェクトが役に立った、あるいはまだ続けている個人開発者を応援したいなら、**任意の支援**だけで十分です。

ここまで読んでくださり、ありがとうございます。

## コミュニティ

スポンサーは機能パックの購入ではありません。この小さなプロジェクトがもう少し長く続くための助けです。使ってくれること、共有してくれること、Issue を開いてくれることも大きな支援です。

## 支援方法

Alipay / WeChat Pay でスキャンしてください。金額は自由です。少額でも嬉しいです。

<div class="sponsor-qr-grid">

<div class="sponsor-qr-card">

**Alipay**

![Alipay QR](/sponsor/alipay.png)

</div>

<div class="sponsor-qr-card">

**WeChat Pay**

![WeChat Pay QR](/sponsor/wechat.png)

</div>

</div>

> アプリに表示される受取人情報をご確認ください。支援は任意であり、サービス契約や権利の約束ではありません。

## その他の応援

- GitHub で [⭐ Star](https://github.com/recombyn/recombyn)
- 必要そうな友人に紹介する
- アプリ内フィードバックで不便な点を教えてください

## リンク

- [作成を始める](https://recombyn.com)
- [はじめに](/guide/getting-started)
- [About](/legal/about)
`,Eo=`# 赞助 recombyn

Hi，我是 recombyn 的个人开发者。

我曾经也是一名程序员。不过和大多数开发者可能不太一样：我没有很好的学历背景，也没有很漂亮的工作履历，就是底层最普通的那一类。做过外包，经历过裁员，也碰过各种冷眼。这不，我又失业了——还是被优化的，哈哈。找了好久工作，好像确实找不到合适的了；也正常，这个世界上优秀的人太多了。一时也不知道该干什么，就想自己找点事情做，于是有了 recombyn。

没有团队，也没有融资。一个人推进，难免会留下很多不足：稳定性、体验细节、文档，以及以后怎么持续做下去，我心里都有数。也考虑过融资，但流程太重；想做成正规 SaaS，又要面对各种资质和合规成本，以个人之力很难扛下来。

所以这里没有强制套餐，也没有「不赞助就不能用」。  
如果你觉得这个项目对你有帮助，或者愿意支持一位还在坚持的独立开发者，**自愿赞助**就足够了。

谢谢你愿意读到这里。

## 大家庭

赞助不是买功能，而是帮这个小项目活得久一点：修 bug、补能力、回社区反馈。用得开心、愿意转发、愿意提 Issue，同样是很大的支持。

## 赞助方式

扫码即可（支付宝 / 微信）。金额随缘，1 元也珍贵。

<div class="sponsor-qr-grid">

<div class="sponsor-qr-card">

**支付宝**

![支付宝收款码](/sponsor/alipay.png)

</div>

<div class="sponsor-qr-card">

**微信支付**

![微信收款码](/sponsor/wechat.png)

</div>

</div>

> 扫码时请确认收款方信息。赞助属于自愿支持，不构成服务合同或权益承诺。

## 你也可以这样帮忙

- 在 GitHub 给仓库点一颗 [⭐ Star](https://github.com/recombyn/recombyn)
- 把产品推荐给需要的朋友
- 通过产品内反馈告诉我哪里不好用

## 相关链接

- [开始创作](https://recombyn.com)
- [快速入门](/guide/getting-started)
- [关于](/legal/about)
`,Do=`# 贊助 recombyn

Hi，我是 recombyn 的個人開發者。

我曾經也是一名工程師。不過和大多數開發者可能不太一樣：我沒有很好的學歷背景，也沒有很漂亮的工作履歷，就是底層最普通的那一類。做過外包，經歷過裁員，也碰過各種冷眼。這不，我又失業了——還是被優化的，哈哈。找了好久工作，好像確實找不到合適的了；也正常，這個世界上優秀的人太多了。一時也不知道該做什麼，就想自己找點事情做，於是有了 recombyn。

沒有團隊，也沒有融資。一個人推進，難免會留下很多不足：穩定性、體驗細節、文件，以及以後怎麼持續做下去，我心裡都有數。也考慮過融資，但流程太重；想做成正規 SaaS，又要面對各種資質和合規成本，以個人之力很難扛下來。

所以這裡沒有強制套餐，也沒有「不贊助就不能用」。  
如果你覺得這個專案對你有幫助，或者願意支持一位還在堅持的獨立開發者，**自願贊助**就足夠了。

謝謝你願意讀到這裡。

## 大家庭

贊助不是買功能，而是幫這個小專案活得久一點：修 bug、補能力、回社群回饋。用得開心、願意轉發、願意提 Issue，同樣是很大的支持。

## 贊助方式

掃碼即可（支付寶 / 微信）。金額隨緣，1 元也珍貴。

<div class="sponsor-qr-grid">

<div class="sponsor-qr-card">

**支付寶**

![支付寶收款碼](/sponsor/alipay.png)

</div>

<div class="sponsor-qr-card">

**微信支付**

![微信收款碼](/sponsor/wechat.png)

</div>

</div>

> 掃碼時請確認收款方資訊。贊助屬於自願支持，不構成服務契約或權益承諾。

## 你也可以這樣幫忙

- 在 GitHub 給倉庫點一顆 [⭐ Star](https://github.com/recombyn/recombyn)
- 把產品推薦給需要的朋友
- 透過產品內回饋告訴我哪裡不好用

## 相關連結

- [開始創作](https://recombyn.com)
- [快速入門](/guide/getting-started)
- [關於](/legal/about)
`;function Oo(e){return/^https?:\/\//i.test(e)?e:`/recombyn/${e.startsWith(`/`)?e.slice(1):e}`}var ko=[{groupKey:`guide`,items:[{pageKey:`getting-started`,path:`/guide/getting-started`},{pageKey:`canvas`,path:`/guide/canvas`},{pageKey:`shortcuts`,path:`/guide/shortcuts`},{pageKey:`agent`,path:`/guide/agent`},{pageKey:`custom-models`,path:`/guide/custom-models`},{pageKey:`image-generation`,path:`/guide/image-generation`},{pageKey:`video-generation`,path:`/guide/video-generation`},{pageKey:`audio`,path:`/guide/audio`},{pageKey:`lottie`,path:`/guide/lottie`},{pageKey:`assets`,path:`/guide/assets`},{pageKey:`image-tools`,path:`/guide/image-tools`},{pageKey:`skills`,path:`/guide/skills`},{pageKey:`account`,path:`/guide/account`},{pageKey:`desktop`,path:`/guide/desktop`}]},{groupKey:`features`,items:[{pageKey:`overview`,path:`/features/overview`},{pageKey:`plaza`,path:`/features/plaza`},{pageKey:`import`,path:`/features/import`},{pageKey:`export-share`,path:`/features/export-share`}]},{groupKey:`faq`,items:[{pageKey:`faq`,path:`/faq/`}]},{groupKey:`support`,items:[{pageKey:`sponsor`,path:`/sponsor`}]}],Ao=[{pageKey:`terms`,path:`/legal/terms`},{pageKey:`privacy`,path:`/legal/privacy`},{pageKey:`ai-terms`,path:`/legal/ai-terms`},{pageKey:`about`,path:`/legal/about`}],jo={...Object.assign({"../../content/en/faq/index.md":Vi,"../../content/en/features/export-share.md":M,"../../content/en/features/import.md":Hi,"../../content/en/features/overview.md":Ui,"../../content/en/features/plaza.md":Wi,"../../content/en/guide/account.md":Gi,"../../content/en/guide/agent.md":Ki,"../../content/en/guide/assets.md":qi,"../../content/en/guide/audio.md":Ji,"../../content/en/guide/canvas.md":Yi,"../../content/en/guide/custom-models.md":Xi,"../../content/en/guide/desktop.md":Zi,"../../content/en/guide/getting-started.md":Qi,"../../content/en/guide/image-generation.md":$i,"../../content/en/guide/image-tools.md":ea,"../../content/en/guide/lottie.md":ta,"../../content/en/guide/shortcuts.md":na,"../../content/en/guide/skills.md":ra,"../../content/en/guide/video-generation.md":ia,"../../content/en/legal/about.md":aa,"../../content/en/legal/ai-terms.md":oa,"../../content/en/legal/privacy.md":sa,"../../content/en/legal/terms.md":ca,"../../content/ja/faq/index.md":la,"../../content/ja/features/export-share.md":ua,"../../content/ja/features/import.md":da,"../../content/ja/features/overview.md":fa,"../../content/ja/features/plaza.md":pa,"../../content/ja/guide/account.md":ma,"../../content/ja/guide/agent.md":ha,"../../content/ja/guide/assets.md":ga,"../../content/ja/guide/audio.md":_a,"../../content/ja/guide/canvas.md":va,"../../content/ja/guide/custom-models.md":ya,"../../content/ja/guide/desktop.md":ba,"../../content/ja/guide/getting-started.md":xa,"../../content/ja/guide/image-generation.md":Sa,"../../content/ja/guide/image-tools.md":Ca,"../../content/ja/guide/lottie.md":wa,"../../content/ja/guide/shortcuts.md":Ta,"../../content/ja/guide/skills.md":Ea,"../../content/ja/guide/video-generation.md":Da,"../../content/ja/legal/about.md":Oa,"../../content/ja/legal/ai-terms.md":ka,"../../content/ja/legal/privacy.md":Aa,"../../content/ja/legal/terms.md":ja,"../../content/zh-CN/faq/index.md":Ma,"../../content/zh-CN/features/export-share.md":Na,"../../content/zh-CN/features/import.md":Pa,"../../content/zh-CN/features/overview.md":Fa,"../../content/zh-CN/features/plaza.md":Ia,"../../content/zh-CN/guide/account.md":La,"../../content/zh-CN/guide/agent.md":Ra,"../../content/zh-CN/guide/assets.md":za,"../../content/zh-CN/guide/audio.md":Ba,"../../content/zh-CN/guide/canvas.md":Va,"../../content/zh-CN/guide/custom-models.md":Ha,"../../content/zh-CN/guide/desktop.md":Ua,"../../content/zh-CN/guide/getting-started.md":Wa,"../../content/zh-CN/guide/image-generation.md":Ga,"../../content/zh-CN/guide/image-tools.md":Ka,"../../content/zh-CN/guide/lottie.md":qa,"../../content/zh-CN/guide/shortcuts.md":Ja,"../../content/zh-CN/guide/skills.md":Ya,"../../content/zh-CN/guide/video-generation.md":Xa,"../../content/zh-CN/legal/about.md":Za,"../../content/zh-CN/legal/ai-terms.md":Qa,"../../content/zh-CN/legal/privacy.md":$a,"../../content/zh-CN/legal/terms.md":eo,"../../content/zh-TW/faq/index.md":to,"../../content/zh-TW/features/export-share.md":no,"../../content/zh-TW/features/import.md":ro,"../../content/zh-TW/features/overview.md":io,"../../content/zh-TW/features/plaza.md":ao,"../../content/zh-TW/guide/account.md":oo,"../../content/zh-TW/guide/agent.md":so,"../../content/zh-TW/guide/assets.md":co,"../../content/zh-TW/guide/audio.md":lo,"../../content/zh-TW/guide/canvas.md":uo,"../../content/zh-TW/guide/custom-models.md":fo,"../../content/zh-TW/guide/desktop.md":po,"../../content/zh-TW/guide/getting-started.md":mo,"../../content/zh-TW/guide/image-generation.md":ho,"../../content/zh-TW/guide/image-tools.md":go,"../../content/zh-TW/guide/lottie.md":_o,"../../content/zh-TW/guide/shortcuts.md":vo,"../../content/zh-TW/guide/skills.md":yo,"../../content/zh-TW/guide/video-generation.md":bo,"../../content/zh-TW/legal/about.md":N,"../../content/zh-TW/legal/ai-terms.md":xo,"../../content/zh-TW/legal/privacy.md":So,"../../content/zh-TW/legal/terms.md":Co}),...Object.assign({"../../content/en/sponsor.md":wo,"../../content/ja/sponsor.md":To,"../../content/zh-CN/sponsor.md":Eo,"../../content/zh-TW/sponsor.md":Do})};function Mo(e){let t=e.replace(/\\/g,`/`).match(/\/content\/(zh-CN|zh-TW|en|ja)\/(.+)\.md$/);if(!t)return null;let n=t[1],r=t[2];return r.endsWith(`/index`)?(r=r.slice(0,-6),{locale:n,path:`/${r}/`}):{locale:n,path:`/${r}`}}var No={"zh-CN":{},"zh-TW":{},en:{},ja:{}};for(let[e,t]of Object.entries(jo)){let n=Mo(e);n&&(No[n.locale][n.path]=Po(t))}function Po(e){return e.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/,``)}function Fo(e){let t=e.replace(/\.html$/,``);if(t.length>1&&t.endsWith(`/`)){let e=t.slice(0,-1);for(let n of Object.keys(No)){let r=No[n];if(r[t]||r[`${e}/`])return r[t]?t:`${e}/`}return e}for(let e of Object.keys(No)){let n=No[e];if(n[t])return t;if(n[`${t}/`])return`${t}/`}return t}var Io=[`en`,`zh-CN`,`zh-TW`,`ja`];function Lo(e,t){let n=Fo(e),r=No[t]?.[n];if(r)return r;for(let e of Io){if(e===t)continue;let r=No[e]?.[n];if(r)return r}}function Ro(e){let t=Fo(e);for(let e of ko)for(let n of e.items)if(n.path===t||n.path===`${t}/`||`${n.path}`===t)return{groupKey:e.groupKey,pageKey:n.pageKey,path:n.path};return null}function zo(e){let t=Fo(e);return Ao.find(e=>e.path===t||e.path===`${t}/`)?.pageKey??null}function Bo(e){let t=Fo(e);return t.startsWith(`/guide/`)||t.startsWith(`/features/`)||t===`/faq`||t.startsWith(`/faq/`)}function Vo(e){return Fo(e)===`/sponsor`}No[`zh-CN`];var Ho=o((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.fragment`);function r(e,n,r){var i=null;if(r!==void 0&&(i=``+r),n.key!==void 0&&(i=``+n.key),`key`in n)for(var a in r={},n)a!==`key`&&(r[a]=n[a]);else r=n;return n=r.ref,{$$typeof:t,type:e,key:i,ref:n===void 0?null:n,props:r}}e.Fragment=n,e.jsx=r,e.jsxs=r})),P=o(((e,t)=>{t.exports=Ho()}))();function Uo(){let{t:e,i18n:t}=li(),[n,r]=(0,S.useState)(!1),i=(0,S.useRef)(null),a=Bi(t.resolvedLanguage||t.language),o=Ri.find(e=>e.code===a)?.label||a;(0,S.useEffect)(()=>{if(!n)return;let e=e=>{i.current?.contains(e.target)||r(!1)},t=e=>{e.key===`Escape`&&r(!1)};return document.addEventListener(`mousedown`,e),document.addEventListener(`keydown`,t),()=>{document.removeEventListener(`mousedown`,e),document.removeEventListener(`keydown`,t)}},[n]);let s=e=>{r(!1),e!==a&&t.changeLanguage(e)};return(0,P.jsxs)(`div`,{className:`docs-lang`,ref:i,children:[(0,P.jsxs)(`button`,{type:`button`,className:`docs-lang-btn`,"aria-label":e(`langLabel`),"aria-haspopup":`listbox`,"aria-expanded":n,onClick:()=>r(e=>!e),children:[(0,P.jsxs)(`svg`,{className:`docs-lang-globe`,viewBox:`0 0 24 24`,fill:`none`,"aria-hidden":!0,children:[(0,P.jsx)(`circle`,{cx:`12`,cy:`12`,r:`9`,stroke:`currentColor`,strokeWidth:`1.6`}),(0,P.jsx)(`path`,{d:`M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z`,stroke:`currentColor`,strokeWidth:`1.6`})]}),(0,P.jsx)(`span`,{className:`docs-lang-label`,children:o}),(0,P.jsx)(`svg`,{className:`docs-lang-caret`,viewBox:`0 0 12 12`,fill:`none`,"aria-hidden":!0,children:(0,P.jsx)(`path`,{d:`M3 4.5L6 7.5L9 4.5`,stroke:`currentColor`,strokeWidth:`1.4`})})]}),n?(0,P.jsx)(`ul`,{className:`docs-lang-menu`,role:`listbox`,"aria-label":e(`langLabel`),children:Ri.map(e=>(0,P.jsx)(`li`,{role:`option`,"aria-selected":e.code===a,children:(0,P.jsx)(`button`,{type:`button`,className:e.code===a?`active`:void 0,onClick:()=>s(e.code),children:e.label})},e.code))}):null]})}var Wo=`https://recombyn.com`,Go=`https://github.com/recombyn/recombyn`;function Ko(e,t){return e.some(e=>e.path.endsWith(`/`)?t===e.path||t===e.path.slice(0,-1):t===e.path)}function qo(e){if(!e)return[];let t=e.querySelectorAll(`.docs-article h2[id], .docs-article h3[id]`);return Array.from(t).map(e=>({id:e.id,text:(e.textContent||``).trim(),level:e.tagName===`H3`?3:2}))}function Jo(){let{pathname:e}=pt(),{t}=li(),[n,r]=(0,S.useState)([]),[i,a]=(0,S.useState)(``);return(0,S.useEffect)(()=>{let e=!1,t=null,n=null,i=e=>{if(t?.disconnect(),e.length){t=new IntersectionObserver(e=>{let t=e.filter(e=>e.isIntersecting).sort((e,t)=>e.boundingClientRect.top-t.boundingClientRect.top)[0]?.target.id;t&&a(t)},{rootMargin:`-80px 0px -55% 0px`,threshold:[0,1]});for(let n of e){let e=document.getElementById(n.id);e&&t.observe(e)}}},o=()=>{if(e)return;let t=qo(document.querySelector(`.docs-main .docs-article`));r(t),a(e=>t.some(t=>t.id===e)?e:t[0]?.id??``),i(t)};o();let s=window.setTimeout(o,50),c,l=document.querySelector(`.docs-main`);return l&&(n=new MutationObserver(()=>{window.clearTimeout(c),c=window.setTimeout(o,30)}),n.observe(l,{childList:!0,subtree:!0})),()=>{e=!0,window.clearTimeout(s),window.clearTimeout(c),t?.disconnect(),n?.disconnect()}},[e]),n.length?(0,P.jsxs)(`aside`,{className:`docs-toc`,"aria-label":t(`tocAria`),children:[(0,P.jsx)(`p`,{className:`docs-toc-title`,children:t(`onThisPage`)}),(0,P.jsx)(`nav`,{className:`docs-toc-list`,children:n.map(e=>(0,P.jsx)(`a`,{href:`#${e.id}`,className:`docs-toc-link level-${e.level}${i===e.id?` active`:``}`,onClick:t=>{t.preventDefault();let n=document.getElementById(e.id);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),history.replaceState(null,``,`#${e.id}`),a(e.id))},children:e.text},e.id))})]}):null}function Yo(){let{pathname:e}=pt(),{t}=li(),[n,r]=(0,S.useState)(!1),i=Ro(e),[a,o]=(0,S.useState)(()=>Object.fromEntries(ko.map(e=>[e.groupKey,!0])));(0,S.useEffect)(()=>{r(!1)},[e]),(0,S.useEffect)(()=>{i&&o(e=>e[i.groupKey]?e:{...e,[i.groupKey]:!0})},[i?.groupKey]);function s(e){o(t=>({...t,[e]:!t[e]}))}return(0,P.jsxs)(`div`,{className:`docs-shell${n?` sidebar-open`:``}`,children:[(0,P.jsxs)(`header`,{className:`docs-top`,children:[(0,P.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,gap:12},children:[(0,P.jsx)(`button`,{type:`button`,className:`docs-mobile-toggle`,"aria-label":t(`openMenu`),onClick:()=>r(e=>!e),children:(0,P.jsx)(`svg`,{width:`16`,height:`16`,viewBox:`0 0 16 16`,fill:`none`,"aria-hidden":!0,children:(0,P.jsx)(`path`,{d:`M2 4h12M2 8h12M2 12h12`,stroke:`currentColor`,strokeWidth:`1.5`})})}),(0,P.jsxs)(jn,{to:`/guide/getting-started`,className:`docs-brand`,children:[(0,P.jsx)(`img`,{src:Oo(`/logo-mark.png`),width:22,height:22,alt:``}),(0,P.jsxs)(`span`,{className:`docs-brand-text`,children:[(0,P.jsx)(`span`,{className:`docs-brand-name`,children:`recombyn`}),(0,P.jsx)(`span`,{className:`docs-brand-sub`,children:t(`brandDocs`)})]})]})]}),(0,P.jsxs)(`nav`,{className:`docs-top-nav`,"aria-label":t(`navAria`),children:[(0,P.jsx)(`a`,{href:Wo,children:t(`navHome`)}),(0,P.jsx)(jn,{to:`/guide/getting-started`,className:Bo(e)?`active`:void 0,children:t(`navDocs`)}),(0,P.jsx)(jn,{to:`/sponsor`,className:Vo(e)?`active docs-nav-sponsor`:`docs-nav-sponsor`,children:t(`navSponsor`)}),(0,P.jsx)(`a`,{href:Go,target:`_blank`,rel:`noopener noreferrer`,children:`GitHub`})]}),(0,P.jsxs)(`div`,{className:`docs-top-actions`,children:[(0,P.jsx)(Uo,{}),(0,P.jsx)(`a`,{className:`docs-cta`,href:Wo,target:`_blank`,rel:`noopener noreferrer`,children:t(`startCreating`)})]})]}),(0,P.jsxs)(`div`,{className:`docs-body`,children:[(0,P.jsx)(`aside`,{className:`docs-sidebar`,"aria-label":t(`sidebarAria`),children:ko.map(n=>{let r=a[n.groupKey]??!0,i=Ko(n.items,e);return(0,P.jsxs)(`div`,{className:`docs-group${i?` has-active`:``}`,children:[(0,P.jsxs)(`button`,{type:`button`,className:`docs-group-toggle`,"aria-expanded":r,onClick:()=>s(n.groupKey),children:[(0,P.jsx)(`span`,{className:`docs-group-title`,children:t(`groups.${n.groupKey}`)}),(0,P.jsx)(`svg`,{className:`docs-group-chevron${r?` open`:``}`,width:`14`,height:`14`,viewBox:`0 0 16 16`,fill:`none`,"aria-hidden":!0,children:(0,P.jsx)(`path`,{d:`M4 6l4 4 4-4`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`})})]}),r?(0,P.jsx)(`div`,{className:`docs-group-list`,children:n.items.map(e=>(0,P.jsx)(Mn,{to:e.path,className:({isActive:e})=>e?`active`:void 0,end:e.path.endsWith(`/`),children:t(`pages.${e.pageKey}`)},e.path))}):null]},n.groupKey)})}),(0,P.jsx)(`main`,{className:`docs-main`,children:(0,P.jsxs)(`div`,{className:`docs-main-inner`,children:[i?(0,P.jsxs)(`p`,{className:`docs-breadcrumb`,children:[t(`groups.${i.groupKey}`),` / `,t(`pages.${i.pageKey}`)]}):null,(0,P.jsx)(Ht,{})]})}),(0,P.jsx)(Jo,{})]})]})}function Xo(){let{t:e}=li();return(0,P.jsxs)(`div`,{className:`legal-shell`,children:[(0,P.jsx)(`header`,{className:`legal-top`,children:(0,P.jsxs)(`div`,{className:`legal-top-inner`,children:[(0,P.jsxs)(jn,{className:`legal-brand`,to:`/guide/getting-started`,children:[(0,P.jsx)(`img`,{className:`legal-mark`,src:Oo(`/logo-mark-light.png`),width:22,height:22,alt:``}),(0,P.jsx)(`span`,{children:`recombyn`})]}),(0,P.jsx)(`div`,{className:`legal-top-actions`,children:(0,P.jsx)(Uo,{})})]})}),(0,P.jsxs)(`main`,{className:`legal-main`,children:[(0,P.jsx)(`p`,{className:`legal-product`,"aria-hidden":!0,children:`recombyn`}),(0,P.jsx)(Ht,{}),(0,P.jsx)(`nav`,{className:`legal-links`,"aria-label":e(`legalNavAria`),children:Ao.map(t=>(0,P.jsx)(Mn,{to:t.path,className:({isActive:e})=>e?`active`:void 0,children:e(`pages.${t.pageKey}`)},t.path))})]}),(0,P.jsx)(`footer`,{className:`legal-foot`,children:(0,P.jsx)(`p`,{children:e(`legalTagline`)})})]})}function Zo(e){let t=[],n=String(e||``),r=n.indexOf(`,`),i=0,a=!1;for(;!a;){r===-1&&(r=n.length,a=!0);let e=n.slice(i,r).trim();(e||!a)&&t.push(e),i=r+1,r=n.indexOf(`,`,i)}return t}function Qo(e,t){let n=t||{};return(e[e.length-1]===``?[...e,``]:e).join((n.padRight?` `:``)+`,`+(n.padLeft===!1?``:` `)).trim()}var $o=/^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u,es=/^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u,ts={};function ns(e,t){return((t||ts).jsx?es:$o).test(e)}var rs=/[ \t\n\f\r]/g;function is(e){return typeof e==`object`?e.type===`text`&&as(e.value):as(e)}function as(e){return e.replace(rs,``)===``}var os=class{constructor(e,t,n){this.normal=t,this.property=e,n&&(this.space=n)}};os.prototype.normal={},os.prototype.property={},os.prototype.space=void 0;function ss(e,t){let n={},r={};for(let t of e)Object.assign(n,t.property),Object.assign(r,t.normal);return new os(n,r,t)}function cs(e){return e.toLowerCase()}var ls=class{constructor(e,t){this.attribute=t,this.property=e}};ls.prototype.attribute=``,ls.prototype.booleanish=!1,ls.prototype.boolean=!1,ls.prototype.commaOrSpaceSeparated=!1,ls.prototype.commaSeparated=!1,ls.prototype.defined=!1,ls.prototype.mustUseProperty=!1,ls.prototype.number=!1,ls.prototype.overloadedBoolean=!1,ls.prototype.property=``,ls.prototype.spaceSeparated=!1,ls.prototype.space=void 0;var us=s({boolean:()=>F,booleanish:()=>fs,commaOrSpaceSeparated:()=>gs,commaSeparated:()=>hs,number:()=>I,overloadedBoolean:()=>ps,spaceSeparated:()=>ms}),ds=0,F=_s(),fs=_s(),ps=_s(),I=_s(),ms=_s(),hs=_s(),gs=_s();function _s(){return 2**++ds}var vs=Object.keys(us),ys=class extends ls{constructor(e,t,n,r){let i=-1;if(super(e,t),bs(this,`space`,r),typeof n==`number`)for(;++i<vs.length;){let e=vs[i];bs(this,vs[i],(n&us[e])===us[e])}}};ys.prototype.defined=!0;function bs(e,t,n){n&&(e[t]=n)}function xs(e){let t={},n={};for(let[r,i]of Object.entries(e.properties)){let a=new ys(r,e.transform(e.attributes||{},r),i,e.space);e.mustUseProperty&&e.mustUseProperty.includes(r)&&(a.mustUseProperty=!0),t[r]=a,n[cs(r)]=r,n[cs(a.attribute)]=r}return new os(t,n,e.space)}var Ss=xs({properties:{ariaActiveDescendant:null,ariaAtomic:fs,ariaAutoComplete:null,ariaBusy:fs,ariaChecked:fs,ariaColCount:I,ariaColIndex:I,ariaColSpan:I,ariaControls:ms,ariaCurrent:null,ariaDescribedBy:ms,ariaDetails:null,ariaDisabled:fs,ariaDropEffect:ms,ariaErrorMessage:null,ariaExpanded:fs,ariaFlowTo:ms,ariaGrabbed:fs,ariaHasPopup:null,ariaHidden:fs,ariaInvalid:null,ariaKeyShortcuts:null,ariaLabel:null,ariaLabelledBy:ms,ariaLevel:I,ariaLive:null,ariaModal:fs,ariaMultiLine:fs,ariaMultiSelectable:fs,ariaOrientation:null,ariaOwns:ms,ariaPlaceholder:null,ariaPosInSet:I,ariaPressed:fs,ariaReadOnly:fs,ariaRelevant:null,ariaRequired:fs,ariaRoleDescription:ms,ariaRowCount:I,ariaRowIndex:I,ariaRowSpan:I,ariaSelected:fs,ariaSetSize:I,ariaSort:null,ariaValueMax:I,ariaValueMin:I,ariaValueNow:I,ariaValueText:null,role:null},transform(e,t){return t===`role`?t:`aria-`+t.slice(4).toLowerCase()}});function Cs(e,t){return t in e?e[t]:t}function ws(e,t){return Cs(e,t.toLowerCase())}var Ts=xs({attributes:{acceptcharset:`accept-charset`,classname:`class`,htmlfor:`for`,httpequiv:`http-equiv`},mustUseProperty:[`checked`,`multiple`,`muted`,`selected`],properties:{abbr:null,accept:hs,acceptCharset:ms,accessKey:ms,action:null,allow:null,allowFullScreen:F,allowPaymentRequest:F,allowUserMedia:F,alpha:F,alt:null,as:null,async:F,autoCapitalize:null,autoComplete:ms,autoFocus:F,autoPlay:F,blocking:ms,capture:null,charSet:null,checked:F,cite:null,className:ms,closedBy:null,colorSpace:null,cols:I,colSpan:I,command:null,commandFor:null,content:null,contentEditable:fs,controls:F,controlsList:ms,coords:I|hs,crossOrigin:null,data:null,dateTime:null,decoding:null,default:F,defer:F,dir:null,dirName:null,disabled:F,download:ps,draggable:fs,encType:null,enterKeyHint:null,fetchPriority:null,form:null,formAction:null,formEncType:null,formMethod:null,formNoValidate:F,formTarget:null,headers:ms,height:I,hidden:ps,high:I,href:null,hrefLang:null,htmlFor:ms,httpEquiv:ms,id:null,imageSizes:null,imageSrcSet:null,inert:F,inputMode:null,integrity:null,is:null,isMap:F,itemId:null,itemProp:ms,itemRef:ms,itemScope:F,itemType:ms,kind:null,label:null,lang:null,language:null,list:null,loading:null,loop:F,low:I,manifest:null,max:null,maxLength:I,media:null,method:null,min:null,minLength:I,multiple:F,muted:F,name:null,nonce:null,noModule:F,noValidate:F,onAbort:null,onAfterPrint:null,onAuxClick:null,onBeforeMatch:null,onBeforePrint:null,onBeforeToggle:null,onBeforeUnload:null,onBlur:null,onCancel:null,onCanPlay:null,onCanPlayThrough:null,onChange:null,onClick:null,onClose:null,onContextLost:null,onContextMenu:null,onContextRestored:null,onCopy:null,onCueChange:null,onCut:null,onDblClick:null,onDrag:null,onDragEnd:null,onDragEnter:null,onDragExit:null,onDragLeave:null,onDragOver:null,onDragStart:null,onDrop:null,onDurationChange:null,onEmptied:null,onEnded:null,onError:null,onFocus:null,onFormData:null,onHashChange:null,onInput:null,onInvalid:null,onKeyDown:null,onKeyPress:null,onKeyUp:null,onLanguageChange:null,onLoad:null,onLoadedData:null,onLoadedMetadata:null,onLoadEnd:null,onLoadStart:null,onMessage:null,onMessageError:null,onMouseDown:null,onMouseEnter:null,onMouseLeave:null,onMouseMove:null,onMouseOut:null,onMouseOver:null,onMouseUp:null,onOffline:null,onOnline:null,onPageHide:null,onPageShow:null,onPaste:null,onPause:null,onPlay:null,onPlaying:null,onPopState:null,onProgress:null,onRateChange:null,onRejectionHandled:null,onReset:null,onResize:null,onScroll:null,onScrollEnd:null,onSecurityPolicyViolation:null,onSeeked:null,onSeeking:null,onSelect:null,onSlotChange:null,onStalled:null,onStorage:null,onSubmit:null,onSuspend:null,onTimeUpdate:null,onToggle:null,onUnhandledRejection:null,onUnload:null,onVolumeChange:null,onWaiting:null,onWheel:null,open:F,optimum:I,pattern:null,ping:ms,placeholder:null,playsInline:F,popover:null,popoverTarget:null,popoverTargetAction:null,poster:null,preload:null,readOnly:F,referrerPolicy:null,rel:ms,required:F,reversed:F,rows:I,rowSpan:I,sandbox:ms,scope:null,scoped:F,seamless:F,selected:F,shadowRootClonable:F,shadowRootCustomElementRegistry:F,shadowRootDelegatesFocus:F,shadowRootMode:null,shadowRootSerializable:F,shape:null,size:I,sizes:null,slot:null,span:I,spellCheck:fs,src:null,srcDoc:null,srcLang:null,srcSet:null,start:I,step:null,style:null,tabIndex:I,target:null,title:null,translate:null,type:null,typeMustMatch:F,useMap:null,value:fs,width:I,wrap:null,writingSuggestions:null,align:null,aLink:null,archive:ms,axis:null,background:null,bgColor:null,border:I,borderColor:null,bottomMargin:I,cellPadding:null,cellSpacing:null,char:null,charOff:null,classId:null,clear:null,code:null,codeBase:null,codeType:null,color:null,compact:F,declare:F,event:null,face:null,frame:null,frameBorder:null,hSpace:I,leftMargin:I,link:null,longDesc:null,lowSrc:null,marginHeight:I,marginWidth:I,noResize:F,noHref:F,noShade:F,noWrap:F,object:null,profile:null,prompt:null,rev:null,rightMargin:I,rules:null,scheme:null,scrolling:fs,standby:null,summary:null,text:null,topMargin:I,valueType:null,version:null,vAlign:null,vLink:null,vSpace:I,allowTransparency:null,autoCorrect:null,autoSave:null,credentialless:F,disablePictureInPicture:F,disableRemotePlayback:F,exportParts:hs,part:ms,prefix:null,property:null,results:I,security:null,unselectable:null},space:`html`,transform:ws}),Es=xs({attributes:{accentHeight:`accent-height`,alignmentBaseline:`alignment-baseline`,arabicForm:`arabic-form`,baselineShift:`baseline-shift`,capHeight:`cap-height`,className:`class`,clipPath:`clip-path`,clipRule:`clip-rule`,colorInterpolation:`color-interpolation`,colorInterpolationFilters:`color-interpolation-filters`,colorProfile:`color-profile`,colorRendering:`color-rendering`,crossOrigin:`crossorigin`,dataType:`datatype`,dominantBaseline:`dominant-baseline`,enableBackground:`enable-background`,fillOpacity:`fill-opacity`,fillRule:`fill-rule`,floodColor:`flood-color`,floodOpacity:`flood-opacity`,fontFamily:`font-family`,fontSize:`font-size`,fontSizeAdjust:`font-size-adjust`,fontStretch:`font-stretch`,fontStyle:`font-style`,fontVariant:`font-variant`,fontWeight:`font-weight`,glyphName:`glyph-name`,glyphOrientationHorizontal:`glyph-orientation-horizontal`,glyphOrientationVertical:`glyph-orientation-vertical`,hrefLang:`hreflang`,horizAdvX:`horiz-adv-x`,horizOriginX:`horiz-origin-x`,horizOriginY:`horiz-origin-y`,imageRendering:`image-rendering`,letterSpacing:`letter-spacing`,lightingColor:`lighting-color`,markerEnd:`marker-end`,markerMid:`marker-mid`,markerStart:`marker-start`,maskType:`mask-type`,navDown:`nav-down`,navDownLeft:`nav-down-left`,navDownRight:`nav-down-right`,navLeft:`nav-left`,navNext:`nav-next`,navPrev:`nav-prev`,navRight:`nav-right`,navUp:`nav-up`,navUpLeft:`nav-up-left`,navUpRight:`nav-up-right`,onAbort:`onabort`,onActivate:`onactivate`,onAfterPrint:`onafterprint`,onBeforePrint:`onbeforeprint`,onBegin:`onbegin`,onCancel:`oncancel`,onCanPlay:`oncanplay`,onCanPlayThrough:`oncanplaythrough`,onChange:`onchange`,onClick:`onclick`,onClose:`onclose`,onCopy:`oncopy`,onCueChange:`oncuechange`,onCut:`oncut`,onDblClick:`ondblclick`,onDrag:`ondrag`,onDragEnd:`ondragend`,onDragEnter:`ondragenter`,onDragExit:`ondragexit`,onDragLeave:`ondragleave`,onDragOver:`ondragover`,onDragStart:`ondragstart`,onDrop:`ondrop`,onDurationChange:`ondurationchange`,onEmptied:`onemptied`,onEnd:`onend`,onEnded:`onended`,onError:`onerror`,onFocus:`onfocus`,onFocusIn:`onfocusin`,onFocusOut:`onfocusout`,onHashChange:`onhashchange`,onInput:`oninput`,onInvalid:`oninvalid`,onKeyDown:`onkeydown`,onKeyPress:`onkeypress`,onKeyUp:`onkeyup`,onLoad:`onload`,onLoadedData:`onloadeddata`,onLoadedMetadata:`onloadedmetadata`,onLoadStart:`onloadstart`,onMessage:`onmessage`,onMouseDown:`onmousedown`,onMouseEnter:`onmouseenter`,onMouseLeave:`onmouseleave`,onMouseMove:`onmousemove`,onMouseOut:`onmouseout`,onMouseOver:`onmouseover`,onMouseUp:`onmouseup`,onMouseWheel:`onmousewheel`,onOffline:`onoffline`,onOnline:`ononline`,onPageHide:`onpagehide`,onPageShow:`onpageshow`,onPaste:`onpaste`,onPause:`onpause`,onPlay:`onplay`,onPlaying:`onplaying`,onPopState:`onpopstate`,onProgress:`onprogress`,onRateChange:`onratechange`,onRepeat:`onrepeat`,onReset:`onreset`,onResize:`onresize`,onScroll:`onscroll`,onSeeked:`onseeked`,onSeeking:`onseeking`,onSelect:`onselect`,onShow:`onshow`,onStalled:`onstalled`,onStorage:`onstorage`,onSubmit:`onsubmit`,onSuspend:`onsuspend`,onTimeUpdate:`ontimeupdate`,onToggle:`ontoggle`,onUnload:`onunload`,onVolumeChange:`onvolumechange`,onWaiting:`onwaiting`,onZoom:`onzoom`,overlinePosition:`overline-position`,overlineThickness:`overline-thickness`,paintOrder:`paint-order`,panose1:`panose-1`,pointerEvents:`pointer-events`,referrerPolicy:`referrerpolicy`,renderingIntent:`rendering-intent`,shapeRendering:`shape-rendering`,stopColor:`stop-color`,stopOpacity:`stop-opacity`,strikethroughPosition:`strikethrough-position`,strikethroughThickness:`strikethrough-thickness`,strokeDashArray:`stroke-dasharray`,strokeDashOffset:`stroke-dashoffset`,strokeLineCap:`stroke-linecap`,strokeLineJoin:`stroke-linejoin`,strokeMiterLimit:`stroke-miterlimit`,strokeOpacity:`stroke-opacity`,strokeWidth:`stroke-width`,tabIndex:`tabindex`,textAnchor:`text-anchor`,textDecoration:`text-decoration`,textRendering:`text-rendering`,transformOrigin:`transform-origin`,typeOf:`typeof`,underlinePosition:`underline-position`,underlineThickness:`underline-thickness`,unicodeBidi:`unicode-bidi`,unicodeRange:`unicode-range`,unitsPerEm:`units-per-em`,vAlphabetic:`v-alphabetic`,vHanging:`v-hanging`,vIdeographic:`v-ideographic`,vMathematical:`v-mathematical`,vectorEffect:`vector-effect`,vertAdvY:`vert-adv-y`,vertOriginX:`vert-origin-x`,vertOriginY:`vert-origin-y`,wordSpacing:`word-spacing`,writingMode:`writing-mode`,xHeight:`x-height`,playbackOrder:`playbackorder`,timelineBegin:`timelinebegin`},properties:{about:gs,accentHeight:I,accumulate:null,additive:null,alignmentBaseline:null,alphabetic:I,amplitude:I,arabicForm:null,ascent:I,attributeName:null,attributeType:null,azimuth:I,bandwidth:null,baselineShift:null,baseFrequency:null,baseProfile:null,bbox:null,begin:null,bias:I,by:null,calcMode:null,capHeight:I,className:ms,clip:null,clipPath:null,clipPathUnits:null,clipRule:null,color:null,colorInterpolation:null,colorInterpolationFilters:null,colorProfile:null,colorRendering:null,content:null,contentScriptType:null,contentStyleType:null,crossOrigin:null,cursor:null,cx:null,cy:null,d:null,dataType:null,defaultAction:null,descent:I,diffuseConstant:I,direction:null,display:null,dur:null,divisor:I,dominantBaseline:null,download:F,dx:null,dy:null,edgeMode:null,editable:null,elevation:I,enableBackground:null,end:null,event:null,exponent:I,externalResourcesRequired:null,fill:null,fillOpacity:I,fillRule:null,filter:null,filterRes:null,filterUnits:null,floodColor:null,floodOpacity:null,focusable:null,focusHighlight:null,fontFamily:null,fontSize:null,fontSizeAdjust:null,fontStretch:null,fontStyle:null,fontVariant:null,fontWeight:null,format:null,fr:null,from:null,fx:null,fy:null,g1:hs,g2:hs,glyphName:hs,glyphOrientationHorizontal:null,glyphOrientationVertical:null,glyphRef:null,gradientTransform:null,gradientUnits:null,handler:null,hanging:I,hatchContentUnits:null,hatchUnits:null,height:null,href:null,hrefLang:null,horizAdvX:I,horizOriginX:I,horizOriginY:I,id:null,ideographic:I,imageRendering:null,initialVisibility:null,in:null,in2:null,intercept:I,k:I,k1:I,k2:I,k3:I,k4:I,kernelMatrix:gs,kernelUnitLength:null,keyPoints:null,keySplines:null,keyTimes:null,kerning:null,lang:null,lengthAdjust:null,letterSpacing:null,lightingColor:null,limitingConeAngle:I,local:null,markerEnd:null,markerMid:null,markerStart:null,markerHeight:null,markerUnits:null,markerWidth:null,mask:null,maskContentUnits:null,maskType:null,maskUnits:null,mathematical:null,max:null,media:null,mediaCharacterEncoding:null,mediaContentEncodings:null,mediaSize:I,mediaTime:null,method:null,min:null,mode:null,name:null,navDown:null,navDownLeft:null,navDownRight:null,navLeft:null,navNext:null,navPrev:null,navRight:null,navUp:null,navUpLeft:null,navUpRight:null,numOctaves:null,observer:null,offset:null,onAbort:null,onActivate:null,onAfterPrint:null,onBeforePrint:null,onBegin:null,onCancel:null,onCanPlay:null,onCanPlayThrough:null,onChange:null,onClick:null,onClose:null,onCopy:null,onCueChange:null,onCut:null,onDblClick:null,onDrag:null,onDragEnd:null,onDragEnter:null,onDragExit:null,onDragLeave:null,onDragOver:null,onDragStart:null,onDrop:null,onDurationChange:null,onEmptied:null,onEnd:null,onEnded:null,onError:null,onFocus:null,onFocusIn:null,onFocusOut:null,onHashChange:null,onInput:null,onInvalid:null,onKeyDown:null,onKeyPress:null,onKeyUp:null,onLoad:null,onLoadedData:null,onLoadedMetadata:null,onLoadStart:null,onMessage:null,onMouseDown:null,onMouseEnter:null,onMouseLeave:null,onMouseMove:null,onMouseOut:null,onMouseOver:null,onMouseUp:null,onMouseWheel:null,onOffline:null,onOnline:null,onPageHide:null,onPageShow:null,onPaste:null,onPause:null,onPlay:null,onPlaying:null,onPopState:null,onProgress:null,onRateChange:null,onRepeat:null,onReset:null,onResize:null,onScroll:null,onSeeked:null,onSeeking:null,onSelect:null,onShow:null,onStalled:null,onStorage:null,onSubmit:null,onSuspend:null,onTimeUpdate:null,onToggle:null,onUnload:null,onVolumeChange:null,onWaiting:null,onZoom:null,opacity:null,operator:null,order:null,orient:null,orientation:null,origin:null,overflow:null,overlay:null,overlinePosition:I,overlineThickness:I,paintOrder:null,panose1:null,path:null,pathLength:I,patternContentUnits:null,patternTransform:null,patternUnits:null,phase:null,ping:ms,pitch:null,playbackOrder:null,pointerEvents:null,points:null,pointsAtX:I,pointsAtY:I,pointsAtZ:I,preserveAlpha:null,preserveAspectRatio:null,primitiveUnits:null,propagate:null,property:gs,r:null,radius:null,referrerPolicy:null,refX:null,refY:null,rel:gs,rev:gs,renderingIntent:null,repeatCount:null,repeatDur:null,requiredExtensions:gs,requiredFeatures:gs,requiredFonts:gs,requiredFormats:gs,resource:null,restart:null,result:null,rotate:null,rx:null,ry:null,scale:null,seed:null,shapeRendering:null,side:null,slope:null,snapshotTime:null,specularConstant:I,specularExponent:I,spreadMethod:null,spacing:null,startOffset:null,stdDeviation:null,stemh:null,stemv:null,stitchTiles:null,stopColor:null,stopOpacity:null,strikethroughPosition:I,strikethroughThickness:I,string:null,stroke:null,strokeDashArray:gs,strokeDashOffset:null,strokeLineCap:null,strokeLineJoin:null,strokeMiterLimit:I,strokeOpacity:I,strokeWidth:null,style:null,surfaceScale:I,syncBehavior:null,syncBehaviorDefault:null,syncMaster:null,syncTolerance:null,syncToleranceDefault:null,systemLanguage:gs,tabIndex:I,tableValues:null,target:null,targetX:I,targetY:I,textAnchor:null,textDecoration:null,textRendering:null,textLength:null,timelineBegin:null,title:null,transformBehavior:null,type:null,typeOf:gs,to:null,transform:null,transformOrigin:null,u1:null,u2:null,underlinePosition:I,underlineThickness:I,unicode:null,unicodeBidi:null,unicodeRange:null,unitsPerEm:I,values:null,vAlphabetic:I,vMathematical:I,vectorEffect:null,vHanging:I,vIdeographic:I,version:null,vertAdvY:I,vertOriginX:I,vertOriginY:I,viewBox:null,viewTarget:null,visibility:null,width:null,widths:null,wordSpacing:null,writingMode:null,x:null,x1:null,x2:null,xChannelSelector:null,xHeight:I,y:null,y1:null,y2:null,yChannelSelector:null,z:null,zoomAndPan:null},space:`svg`,transform:Cs}),Ds=xs({properties:{xLinkActuate:null,xLinkArcRole:null,xLinkHref:null,xLinkRole:null,xLinkShow:null,xLinkTitle:null,xLinkType:null},space:`xlink`,transform(e,t){return`xlink:`+t.slice(5).toLowerCase()}}),Os=xs({attributes:{xmlnsxlink:`xmlns:xlink`},properties:{xmlnsXLink:null,xmlns:null},space:`xmlns`,transform:ws}),ks=xs({properties:{xmlBase:null,xmlLang:null,xmlSpace:null},space:`xml`,transform(e,t){return`xml:`+t.slice(3).toLowerCase()}}),As={classId:`classID`,dataType:`datatype`,itemId:`itemID`,strokeDashArray:`strokeDasharray`,strokeDashOffset:`strokeDashoffset`,strokeLineCap:`strokeLinecap`,strokeLineJoin:`strokeLinejoin`,strokeMiterLimit:`strokeMiterlimit`,typeOf:`typeof`,xLinkActuate:`xlinkActuate`,xLinkArcRole:`xlinkArcrole`,xLinkHref:`xlinkHref`,xLinkRole:`xlinkRole`,xLinkShow:`xlinkShow`,xLinkTitle:`xlinkTitle`,xLinkType:`xlinkType`,xmlnsXLink:`xmlnsXlink`},js=/[A-Z]/g,Ms=/-[a-z]/g,Ns=/^data[-\w.:]+$/i;function Ps(e,t){let n=cs(t),r=t,i=ls;if(n in e.normal)return e.property[e.normal[n]];if(n.length>4&&n.slice(0,4)===`data`&&Ns.test(t)){if(t.charAt(4)===`-`){let e=t.slice(5).replace(Ms,Is);r=`data`+e.charAt(0).toUpperCase()+e.slice(1)}else{let e=t.slice(4);if(!Ms.test(e)){let n=e.replace(js,Fs);n.charAt(0)!==`-`&&(n=`-`+n),t=`data`+n}}i=ys}return new i(r,t)}function Fs(e){return`-`+e.toLowerCase()}function Is(e){return e.charAt(1).toUpperCase()}var Ls=ss([Ss,Ts,Ds,Os,ks],`html`),Rs=ss([Ss,Es,Ds,Os,ks],`svg`);function zs(e){let t=String(e||``).trim();return t?t.split(/[ \t\n\r\f]+/g):[]}function Bs(e){return e.join(` `).trim()}var Vs=o(((e,t)=>{var n=/\/\*[^*]*\*+([^/*][^*]*\*+)*\//g,r=/\n/g,i=/^\s*/,a=/^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/,o=/^:\s*/,s=/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/,c=/^[;\s]*/,l=/^\s+|\s+$/g;function u(e,t){if(typeof e!=`string`)throw TypeError(`First argument must be a string`);if(!e)return[];t||={};var l=1,u=1;function f(e){var t=e.match(r);t&&(l+=t.length);var n=e.lastIndexOf(`
`);u=~n?e.length-n:u+e.length}function p(){var e={line:l,column:u};return function(t){return t.position=new m(e),_(),t}}function m(e){this.start=e,this.end={line:l,column:u},this.source=t.source}m.prototype.content=e;function h(n){var r=Error(t.source+`:`+l+`:`+u+`: `+n);if(r.reason=n,r.filename=t.source,r.line=l,r.column=u,r.source=e,!t.silent)throw r}function g(t){var n=t.exec(e);if(n){var r=n[0];return f(r),e=e.slice(r.length),n}}function _(){g(i)}function v(e){var t;for(e||=[];t=y();)t!==!1&&e.push(t);return e}function y(){var t=p();if(e.charAt(0)==`/`&&e.charAt(1)==`*`){for(var n=2;e.charAt(n)!=``&&(e.charAt(n)!=`*`||e.charAt(n+1)!=`/`);)++n;if(n+=2,e.charAt(n-1)===``)return h(`End of comment missing`);var r=e.slice(2,n-2);return u+=2,f(r),e=e.slice(n),u+=2,t({type:`comment`,comment:r})}}function b(){var e=p(),t=g(a);if(t){if(y(),!g(o))return h(`property missing ':'`);var r=g(s),i=e({type:`declaration`,property:d(t[0].replace(n,``)),value:r?d(r[0].replace(n,``)):``});return g(c),i}}function x(){var e=[];v(e);for(var t;t=b();)t!==!1&&(e.push(t),v(e));return e}return _(),x()}function d(e){return e?e.replace(l,``):``}t.exports=u})),Hs=o((e=>{var t=e&&e.__importDefault||function(e){return e&&e.__esModule?e:{default:e}};Object.defineProperty(e,"__esModule",{value:!0}),e.default=r;var n=t(Vs());function r(e,t){let r=null;if(!e||typeof e!=`string`)return r;let i=(0,n.default)(e),a=typeof t==`function`;return i.forEach(e=>{if(e.type!==`declaration`)return;let{property:n,value:i}=e;a?t(n,i,e):i&&(r||={},r[n]=i)}),r}})),Us=o((e=>{Object.defineProperty(e,"__esModule",{value:!0}),e.camelCase=void 0;var t=/^--[a-zA-Z0-9_-]+$/,n=/-([a-z])/g,r=/^[^-]+$/,i=/^-(webkit|moz|ms|o|khtml)-/,a=/^-(ms)-/,o=function(e){return!e||r.test(e)||t.test(e)},s=function(e,t){return t.toUpperCase()},c=function(e,t){return`${t}-`};e.camelCase=function(e,t){return t===void 0&&(t={}),o(e)?e:(e=e.toLowerCase(),e=t.reactCompat?e.replace(a,c):e.replace(i,c),e.replace(n,s))}})),Ws=o(((e,t)=>{var n=(e&&e.__importDefault||function(e){return e&&e.__esModule?e:{default:e}})(Hs()),r=Us();function i(e,t){var i={};return!e||typeof e!=`string`||(0,n.default)(e,function(e,n){e&&n&&(i[(0,r.camelCase)(e,t)]=n)}),i}i.default=i,t.exports=i})),Gs=qs(`end`),Ks=qs(`start`);function qs(e){return t;function t(t){let n=t&&t.position&&t.position[e]||{};if(typeof n.line==`number`&&n.line>0&&typeof n.column==`number`&&n.column>0)return{line:n.line,column:n.column,offset:typeof n.offset==`number`&&n.offset>-1?n.offset:void 0}}}function Js(e){let t=Ks(e),n=Gs(e);if(t&&n)return{start:t,end:n}}function Ys(e){return!e||typeof e!=`object`?``:`position`in e||`type`in e?Zs(e.position):`start`in e||`end`in e?Zs(e):`line`in e||`column`in e?Xs(e):``}function Xs(e){return Qs(e&&e.line)+`:`+Qs(e&&e.column)}function Zs(e){return Xs(e&&e.start)+`-`+Xs(e&&e.end)}function Qs(e){return e&&typeof e==`number`?e:1}var $s=class extends Error{constructor(e,t,n){super(),typeof t==`string`&&(n=t,t=void 0);let r=``,i={},a=!1;if(t&&(i=`line`in t&&`column`in t||`start`in t&&`end`in t?{place:t}:`type`in t?{ancestors:[t],place:t.position}:{...t}),typeof e==`string`?r=e:!i.cause&&e&&(a=!0,r=e.message,i.cause=e),!i.ruleId&&!i.source&&typeof n==`string`){let e=n.indexOf(`:`);e===-1?i.ruleId=n:(i.source=n.slice(0,e),i.ruleId=n.slice(e+1))}if(!i.place&&i.ancestors&&i.ancestors){let e=i.ancestors[i.ancestors.length-1];e&&(i.place=e.position)}let o=i.place&&`start`in i.place?i.place.start:i.place;this.ancestors=i.ancestors||void 0,this.cause=i.cause||void 0,this.column=o?o.column:void 0,this.fatal=void 0,this.file=``,this.message=r,this.line=o?o.line:void 0,this.name=Ys(i.place)||`1:1`,this.place=i.place||void 0,this.reason=this.message,this.ruleId=i.ruleId||void 0,this.source=i.source||void 0,this.stack=a&&i.cause&&typeof i.cause.stack==`string`?i.cause.stack:``,this.actual=void 0,this.expected=void 0,this.note=void 0,this.url=void 0}};$s.prototype.file=``,$s.prototype.name=``,$s.prototype.reason=``,$s.prototype.message=``,$s.prototype.stack=``,$s.prototype.column=void 0,$s.prototype.line=void 0,$s.prototype.ancestors=void 0,$s.prototype.cause=void 0,$s.prototype.fatal=void 0,$s.prototype.place=void 0,$s.prototype.ruleId=void 0,$s.prototype.source=void 0;var ec=l(Ws(),1),tc={}.hasOwnProperty,nc=new Map,rc=/[A-Z]/g,ic=new Set([`table`,`tbody`,`thead`,`tfoot`,`tr`]),ac=new Set([`td`,`th`]);function oc(e,t){if(!t||t.Fragment===void 0)throw TypeError("Expected `Fragment` in options");let n=t.filePath||void 0,r;if(t.development){if(typeof t.jsxDEV!=`function`)throw TypeError("Expected `jsxDEV` in options when `development: true`");r=_c(n,t.jsxDEV)}else{if(typeof t.jsx!=`function`)throw TypeError("Expected `jsx` in production options");if(typeof t.jsxs!=`function`)throw TypeError("Expected `jsxs` in production options");r=gc(n,t.jsx,t.jsxs)}let i={Fragment:t.Fragment,ancestors:[],components:t.components||{},create:r,elementAttributeNameCase:t.elementAttributeNameCase||`react`,evaluater:t.createEvaluater?t.createEvaluater():void 0,filePath:n,ignoreInvalidStyle:t.ignoreInvalidStyle||!1,passKeys:t.passKeys!==!1,passNode:t.passNode||!1,schema:t.space===`svg`?Rs:Ls,stylePropertyNameCase:t.stylePropertyNameCase||`dom`,tableCellAlignToStyle:t.tableCellAlignToStyle!==!1},a=sc(i,e,void 0);return a&&typeof a!=`string`?a:i.create(e,i.Fragment,{children:a||void 0},void 0)}function sc(e,t,n){if(t.type===`element`)return cc(e,t,n);if(t.type===`mdxFlowExpression`||t.type===`mdxTextExpression`)return lc(e,t);if(t.type===`mdxJsxFlowElement`||t.type===`mdxJsxTextElement`)return dc(e,t,n);if(t.type===`mdxjsEsm`)return uc(e,t);if(t.type===`root`)return fc(e,t,n);if(t.type===`text`)return pc(e,t)}function cc(e,t,n){let r=e.schema,i=r;t.tagName.toLowerCase()===`svg`&&r.space===`html`&&(i=Rs,e.schema=i),e.ancestors.push(t);let a=Cc(e,t.tagName,!1),o=vc(e,t),s=bc(e,t);return ic.has(t.tagName)&&(s=s.filter(function(e){return typeof e!=`string`||!is(e)})),mc(e,o,a,t),hc(o,s),e.ancestors.pop(),e.schema=r,e.create(t,a,o,n)}function lc(e,t){if(t.data&&t.data.estree&&e.evaluater){let n=t.data.estree.body[0];return n.type,e.evaluater.evaluateExpression(n.expression)}wc(e,t.position)}function uc(e,t){if(t.data&&t.data.estree&&e.evaluater)return e.evaluater.evaluateProgram(t.data.estree);wc(e,t.position)}function dc(e,t,n){let r=e.schema,i=r;t.name===`svg`&&r.space===`html`&&(i=Rs,e.schema=i),e.ancestors.push(t);let a=t.name===null?e.Fragment:Cc(e,t.name,!0),o=yc(e,t),s=bc(e,t);return mc(e,o,a,t),hc(o,s),e.ancestors.pop(),e.schema=r,e.create(t,a,o,n)}function fc(e,t,n){let r={};return hc(r,bc(e,t)),e.create(t,e.Fragment,r,n)}function pc(e,t){return t.value}function mc(e,t,n,r){typeof n!=`string`&&n!==e.Fragment&&e.passNode&&(t.node=r)}function hc(e,t){if(t.length>0){let n=t.length>1?t:t[0];n&&(e.children=n)}}function gc(e,t,n){return r;function r(e,r,i,a){let o=Array.isArray(i.children)?n:t;return a?o(r,i,a):o(r,i)}}function _c(e,t){return n;function n(n,r,i,a){let o=Array.isArray(i.children),s=Ks(n);return t(r,i,a,o,{columnNumber:s?s.column-1:void 0,fileName:e,lineNumber:s?s.line:void 0},void 0)}}function vc(e,t){let n={},r,i;for(i in t.properties)if(i!==`children`&&tc.call(t.properties,i)){let a=xc(e,i,t.properties[i]);if(a){let[i,o]=a;e.tableCellAlignToStyle&&i===`align`&&typeof o==`string`&&ac.has(t.tagName)?r=o:n[i]=o}}if(r){let t=n.style||={};t[e.stylePropertyNameCase===`css`?`text-align`:`textAlign`]=r}return n}function yc(e,t){let n={};for(let r of t.attributes)if(r.type===`mdxJsxExpressionAttribute`){if(r.data&&r.data.estree&&e.evaluater){let t=r.data.estree.body[0];t.type;let i=t.expression;i.type;let a=i.properties[0];a.type,Object.assign(n,e.evaluater.evaluateExpression(a.argument))}else wc(e,t.position)}else{let i=r.name,a;if(r.value&&typeof r.value==`object`){if(r.value.data&&r.value.data.estree&&e.evaluater){let t=r.value.data.estree.body[0];t.type,a=e.evaluater.evaluateExpression(t.expression)}else wc(e,t.position)}else a=r.value===null||r.value;n[i]=a}return n}function bc(e,t){let n=[],r=-1,i=e.passKeys?new Map:nc;for(;++r<t.children.length;){let a=t.children[r],o;if(e.passKeys){let e=a.type===`element`?a.tagName:a.type===`mdxJsxFlowElement`||a.type===`mdxJsxTextElement`?a.name:void 0;if(e){let t=i.get(e)||0;o=e+`-`+t,i.set(e,t+1)}}let s=sc(e,a,o);s!==void 0&&n.push(s)}return n}function xc(e,t,n){let r=Ps(e.schema,t);if(!(n==null||typeof n==`number`&&Number.isNaN(n))){if(Array.isArray(n)&&(n=r.commaSeparated?Qo(n):Bs(n)),r.property===`style`){let t=typeof n==`object`?n:Sc(e,String(n));return e.stylePropertyNameCase===`css`&&(t=Tc(t)),[`style`,t]}return[e.elementAttributeNameCase===`react`&&r.space?As[r.property]||r.property:r.attribute,n]}}function Sc(e,t){try{return(0,ec.default)(t,{reactCompat:!0})}catch(t){if(e.ignoreInvalidStyle)return{};let n=t,r=new $s("Cannot parse `style` attribute",{ancestors:e.ancestors,cause:n,ruleId:`style`,source:`hast-util-to-jsx-runtime`});throw r.file=e.filePath||void 0,r.url=`https://github.com/syntax-tree/hast-util-to-jsx-runtime#cannot-parse-style-attribute`,r}}function Cc(e,t,n){let r;if(!n)r={type:`Literal`,value:t};else if(t.includes(`.`)){let e=t.split(`.`),n=-1,i;for(;++n<e.length;){let t=ns(e[n])?{type:`Identifier`,name:e[n]}:{type:`Literal`,value:e[n]};i=i?{type:`MemberExpression`,object:i,property:t,computed:!!(n&&t.type===`Literal`),optional:!1}:t}r=i}else r=ns(t)&&!/^[a-z]/.test(t)?{type:`Identifier`,name:t}:{type:`Literal`,value:t};if(r.type===`Literal`){let t=r.value;return tc.call(e.components,t)?e.components[t]:t}if(e.evaluater)return e.evaluater.evaluateExpression(r);wc(e)}function wc(e,t){let n=new $s("Cannot handle MDX estrees without `createEvaluater`",{ancestors:e.ancestors,place:t,ruleId:`mdx-estree`,source:`hast-util-to-jsx-runtime`});throw n.file=e.filePath||void 0,n.url=`https://github.com/syntax-tree/hast-util-to-jsx-runtime#cannot-handle-mdx-estrees-without-createevaluater`,n}function Tc(e){let t={},n;for(n in e)tc.call(e,n)&&(t[Ec(n)]=e[n]);return t}function Ec(e){let t=e.replace(rc,Dc);return t.slice(0,3)===`ms-`&&(t=`-`+t),t}function Dc(e){return`-`+e.toLowerCase()}var Oc={action:[`form`],cite:[`blockquote`,`del`,`ins`,`q`],data:[`object`],formAction:[`button`,`input`],href:[`a`,`area`,`base`,`link`],icon:[`menuitem`],itemId:null,manifest:[`html`],ping:[`a`,`area`],poster:[`video`],src:[`audio`,`embed`,`iframe`,`img`,`input`,`script`,`source`,`track`,`video`]},kc={};function Ac(e,t){let n=t||kc;return jc(e,typeof n.includeImageAlt!=`boolean`||n.includeImageAlt,typeof n.includeHtml!=`boolean`||n.includeHtml)}function jc(e,t,n){if(Nc(e)){if(`value`in e)return e.type===`html`&&!n?``:e.value;if(t&&`alt`in e&&e.alt)return e.alt;if(`children`in e)return Mc(e.children,t,n)}return Array.isArray(e)?Mc(e,t,n):``}function Mc(e,t,n){let r=[],i=-1;for(;++i<e.length;)r[i]=jc(e[i],t,n);return r.join(``)}function Nc(e){return!!(e&&typeof e==`object`)}var Pc=document.createElement(`i`);function Fc(e){let t=`&`+e+`;`;Pc.innerHTML=t;let n=Pc.textContent;return n.charCodeAt(n.length-1)===59&&e!==`semi`?!1:n!==t&&n}function Ic(e,t,n,r){let i=e.length,a=0,o;if(t=t<0?-t>i?0:i+t:t>i?i:t,n=n>0?n:0,r.length<1e4)o=Array.from(r),o.unshift(t,n),e.splice(...o);else for(n&&e.splice(t,n);a<r.length;)o=r.slice(a,a+1e4),o.unshift(t,0),e.splice(...o),a+=1e4,t+=1e4}function Lc(e,t){return e.length>0?(Ic(e,e.length,0,t),e):t}var Rc={}.hasOwnProperty;function zc(e){let t={},n=-1;for(;++n<e.length;)Bc(t,e[n]);return t}function Bc(e,t){let n;for(n in t){let r=(Rc.call(e,n)?e[n]:void 0)||(e[n]={}),i=t[n],a;if(i)for(a in i){Rc.call(r,a)||(r[a]=[]);let e=i[a];Vc(r[a],Array.isArray(e)?e:e?[e]:[])}}}function Vc(e,t){let n=-1,r=[];for(;++n<t.length;)(t[n].add===`after`?e:r).push(t[n]);Ic(e,0,0,r)}function Hc(e,t){let n=Number.parseInt(e,t);return n<9||n===11||n>13&&n<32||n>126&&n<160||n>55295&&n<57344||n>64975&&n<65008||(n&65535)==65535||(n&65535)==65534||n>1114111?`�`:String.fromCodePoint(n)}function Uc(e){return e.replace(/[\t\n\r ]+/g,` `).replace(/^ | $/g,``).toLowerCase().toUpperCase()}var Wc=$c(/[A-Za-z]/),L=$c(/[\dA-Za-z]/),Gc=$c(/[#-'*+\--9=?A-Z^-~]/);function Kc(e){return e!==null&&(e<32||e===127)}var qc=$c(/\d/),Jc=$c(/[\dA-Fa-f]/),Yc=$c(/[!-/:-@[-`{-~]/);function R(e){return e!==null&&e<-2}function Xc(e){return e!==null&&(e<0||e===32)}function z(e){return e===-2||e===-1||e===32}var Zc=$c(/\p{P}|\p{S}/u),Qc=$c(/\s/);function $c(e){return t;function t(t){return t!==null&&t>-1&&e.test(String.fromCharCode(t))}}function el(e){let t=[],n=-1,r=0,i=0;for(;++n<e.length;){let a=e.charCodeAt(n),o=``;if(a===37&&L(e.charCodeAt(n+1))&&L(e.charCodeAt(n+2)))i=2;else if(a<128)/[!#$&-;=?-Z_a-z~]/.test(String.fromCharCode(a))||(o=String.fromCharCode(a));else if(a>55295&&a<57344){let t=e.charCodeAt(n+1);a<56320&&t>56319&&t<57344?(o=String.fromCharCode(a,t),i=1):o=`�`}else o=String.fromCharCode(a);o&&=(t.push(e.slice(r,n),encodeURIComponent(o)),r=n+i+1,``),i&&=(n+=i,0)}return t.join(``)+e.slice(r)}function B(e,t,n,r){let i=r?r-1:1/0,a=0;return o;function o(r){return z(r)?(e.enter(n),s(r)):t(r)}function s(r){return z(r)&&a++<i?(e.consume(r),s):(e.exit(n),t(r))}}var tl={tokenize:nl};function nl(e){let t=e.attempt(this.parser.constructs.contentInitial,r,i),n;return t;function r(n){if(n===null){e.consume(n);return}return e.enter(`lineEnding`),e.consume(n),e.exit(`lineEnding`),B(e,t,`linePrefix`)}function i(t){return e.enter(`paragraph`),a(t)}function a(t){let r=e.enter(`chunkText`,{contentType:`text`,previous:n});return n&&(n.next=r),n=r,o(t)}function o(t){if(t===null){e.exit(`chunkText`),e.exit(`paragraph`),e.consume(t);return}return R(t)?(e.consume(t),e.exit(`chunkText`),a):(e.consume(t),o)}}var rl={tokenize:al},il={tokenize:ol};function al(e){let t=this,n=[],r=0,i,a,o;return s;function s(i){if(r<n.length){let a=n[r];return t.containerState=a[1],e.attempt(a[0].continuation,c,l)(i)}return l(i)}function c(e){if(r++,t.containerState._closeFlow){t.containerState._closeFlow=void 0,i&&v();let n=t.events.length,a=n,o;for(;a--;)if(t.events[a][0]===`exit`&&t.events[a][1].type===`chunkFlow`){o=t.events[a][1].end;break}_(r);let s=n;for(;s<t.events.length;)t.events[s][1].end={...o},s++;return Ic(t.events,a+1,0,t.events.slice(n)),t.events.length=s,l(e)}return s(e)}function l(a){if(r===n.length){if(!i)return f(a);if(i.currentConstruct&&i.currentConstruct.concrete)return m(a);t.interrupt=!!(i.currentConstruct&&!i._gfmTableDynamicInterruptHack)}return t.containerState={},e.check(il,u,d)(a)}function u(e){return i&&v(),_(r),f(e)}function d(e){return t.parser.lazy[t.now().line]=r!==n.length,o=t.now().offset,m(e)}function f(n){return t.containerState={},e.attempt(il,p,m)(n)}function p(e){return r++,n.push([t.currentConstruct,t.containerState]),f(e)}function m(n){if(n===null){i&&v(),_(0),e.consume(n);return}return i||=t.parser.flow(t.now()),e.enter(`chunkFlow`,{_tokenizer:i,contentType:`flow`,previous:a}),h(n)}function h(n){if(n===null){g(e.exit(`chunkFlow`),!0),_(0),e.consume(n);return}return R(n)?(e.consume(n),g(e.exit(`chunkFlow`)),r=0,t.interrupt=void 0,s):(e.consume(n),h)}function g(e,n){let s=t.sliceStream(e);if(n&&s.push(null),e.previous=a,a&&(a.next=e),a=e,i.defineSkip(e.start),i.write(s),t.parser.lazy[e.start.line]){let e=i.events.length;for(;e--;)if(i.events[e][1].start.offset<o&&(!i.events[e][1].end||i.events[e][1].end.offset>o))return;let n=t.events.length,a=n,s,c;for(;a--;)if(t.events[a][0]===`exit`&&t.events[a][1].type===`chunkFlow`){if(s){c=t.events[a][1].end;break}s=!0}for(_(r),e=n;e<t.events.length;)t.events[e][1].end={...c},e++;Ic(t.events,a+1,0,t.events.slice(n)),t.events.length=e}}function _(r){let i=n.length;for(;i-->r;){let r=n[i];t.containerState=r[1],r[0].exit.call(t,e)}n.length=r}function v(){i.write([null]),a=void 0,i=void 0,t.containerState._closeFlow=void 0}}function ol(e,t,n){return B(e,e.attempt(this.parser.constructs.document,t,n),`linePrefix`,this.parser.constructs.disable.null.includes(`codeIndented`)?void 0:4)}function sl(e){if(e===null||Xc(e)||Qc(e))return 1;if(Zc(e))return 2}function cl(e,t,n){let r=[],i=-1;for(;++i<e.length;){let a=e[i].resolveAll;a&&!r.includes(a)&&(t=a(t,n),r.push(a))}return t}var ll={name:`attention`,resolveAll:ul,tokenize:dl};function ul(e,t){let n=-1,r,i,a,o,s,c,l,u;for(;++n<e.length;)if(e[n][0]===`enter`&&e[n][1].type===`attentionSequence`&&e[n][1]._close){for(r=n;r--;)if(e[r][0]===`exit`&&e[r][1].type===`attentionSequence`&&e[r][1]._open&&t.sliceSerialize(e[r][1]).charCodeAt(0)===t.sliceSerialize(e[n][1]).charCodeAt(0)){if((e[r][1]._close||e[n][1]._open)&&(e[n][1].end.offset-e[n][1].start.offset)%3&&!((e[r][1].end.offset-e[r][1].start.offset+e[n][1].end.offset-e[n][1].start.offset)%3))continue;c=e[r][1].end.offset-e[r][1].start.offset>1&&e[n][1].end.offset-e[n][1].start.offset>1?2:1;let d={...e[r][1].end},f={...e[n][1].start};fl(d,-c),fl(f,c),o={type:c>1?`strongSequence`:`emphasisSequence`,start:d,end:{...e[r][1].end}},s={type:c>1?`strongSequence`:`emphasisSequence`,start:{...e[n][1].start},end:f},a={type:c>1?`strongText`:`emphasisText`,start:{...e[r][1].end},end:{...e[n][1].start}},i={type:c>1?`strong`:`emphasis`,start:{...o.start},end:{...s.end}},e[r][1].end={...o.start},e[n][1].start={...s.end},l=[],e[r][1].end.offset-e[r][1].start.offset&&(l=Lc(l,[[`enter`,e[r][1],t],[`exit`,e[r][1],t]])),l=Lc(l,[[`enter`,i,t],[`enter`,o,t],[`exit`,o,t],[`enter`,a,t]]),l=Lc(l,cl(t.parser.constructs.insideSpan.null,e.slice(r+1,n),t)),l=Lc(l,[[`exit`,a,t],[`enter`,s,t],[`exit`,s,t],[`exit`,i,t]]),e[n][1].end.offset-e[n][1].start.offset?(u=2,l=Lc(l,[[`enter`,e[n][1],t],[`exit`,e[n][1],t]])):u=0,Ic(e,r-1,n-r+3,l),n=r+l.length-u-2;break}}for(n=-1;++n<e.length;)e[n][1].type===`attentionSequence`&&(e[n][1].type=`data`);return e}function dl(e,t){let n=this.parser.constructs.attentionMarkers.null,r=this.previous,i=sl(r),a;return o;function o(t){return a=t,e.enter(`attentionSequence`),s(t)}function s(o){if(o===a)return e.consume(o),s;let c=e.exit(`attentionSequence`),l=sl(o),u=!l||l===2&&i||n.includes(o),d=!i||i===2&&l||n.includes(r);return c._open=!!(a===42?u:u&&(i||!d)),c._close=!!(a===42?d:d&&(l||!u)),t(o)}}function fl(e,t){e.column+=t,e.offset+=t,e._bufferIndex+=t}var pl={name:`autolink`,tokenize:ml};function ml(e,t,n){let r=0;return i;function i(t){return e.enter(`autolink`),e.enter(`autolinkMarker`),e.consume(t),e.exit(`autolinkMarker`),e.enter(`autolinkProtocol`),a}function a(t){return Wc(t)?(e.consume(t),o):t===64?n(t):l(t)}function o(e){return e===43||e===45||e===46||L(e)?(r=1,s(e)):l(e)}function s(t){return t===58?(e.consume(t),r=0,c):(t===43||t===45||t===46||L(t))&&r++<32?(e.consume(t),s):(r=0,l(t))}function c(r){return r===62?(e.exit(`autolinkProtocol`),e.enter(`autolinkMarker`),e.consume(r),e.exit(`autolinkMarker`),e.exit(`autolink`),t):r===null||r===32||r===60||Kc(r)?n(r):(e.consume(r),c)}function l(t){return t===64?(e.consume(t),u):Gc(t)?(e.consume(t),l):n(t)}function u(e){return L(e)?d(e):n(e)}function d(n){return n===46?(e.consume(n),r=0,u):n===62?(e.exit(`autolinkProtocol`).type=`autolinkEmail`,e.enter(`autolinkMarker`),e.consume(n),e.exit(`autolinkMarker`),e.exit(`autolink`),t):f(n)}function f(t){if((t===45||L(t))&&r++<63){let n=t===45?f:d;return e.consume(t),n}return n(t)}}var hl={partial:!0,tokenize:gl};function gl(e,t,n){return r;function r(t){return z(t)?B(e,i,`linePrefix`)(t):i(t)}function i(e){return e===null||R(e)?t(e):n(e)}}var _l={continuation:{tokenize:yl},exit:bl,name:`blockQuote`,tokenize:vl};function vl(e,t,n){let r=this;return i;function i(t){if(t===62){let n=r.containerState;return n.open||=(e.enter(`blockQuote`,{_container:!0}),!0),e.enter(`blockQuotePrefix`),e.enter(`blockQuoteMarker`),e.consume(t),e.exit(`blockQuoteMarker`),a}return n(t)}function a(n){return z(n)?(e.enter(`blockQuotePrefixWhitespace`),e.consume(n),e.exit(`blockQuotePrefixWhitespace`),e.exit(`blockQuotePrefix`),t):(e.exit(`blockQuotePrefix`),t(n))}}function yl(e,t,n){let r=this;return i;function i(t){return z(t)?B(e,a,`linePrefix`,r.parser.constructs.disable.null.includes(`codeIndented`)?void 0:4)(t):a(t)}function a(r){return e.attempt(_l,t,n)(r)}}function bl(e){e.exit(`blockQuote`)}var xl={name:`characterEscape`,tokenize:Sl};function Sl(e,t,n){return r;function r(t){return e.enter(`characterEscape`),e.enter(`escapeMarker`),e.consume(t),e.exit(`escapeMarker`),i}function i(r){return Yc(r)?(e.enter(`characterEscapeValue`),e.consume(r),e.exit(`characterEscapeValue`),e.exit(`characterEscape`),t):n(r)}}var Cl={name:`characterReference`,tokenize:wl};function wl(e,t,n){let r=this,i=0,a,o;return s;function s(t){return e.enter(`characterReference`),e.enter(`characterReferenceMarker`),e.consume(t),e.exit(`characterReferenceMarker`),c}function c(t){return t===35?(e.enter(`characterReferenceMarkerNumeric`),e.consume(t),e.exit(`characterReferenceMarkerNumeric`),l):(e.enter(`characterReferenceValue`),a=31,o=L,u(t))}function l(t){return t===88||t===120?(e.enter(`characterReferenceMarkerHexadecimal`),e.consume(t),e.exit(`characterReferenceMarkerHexadecimal`),e.enter(`characterReferenceValue`),a=6,o=Jc,u):(e.enter(`characterReferenceValue`),a=7,o=qc,u(t))}function u(s){if(s===59&&i){let i=e.exit(`characterReferenceValue`);return o===L&&!Fc(r.sliceSerialize(i))?n(s):(e.enter(`characterReferenceMarker`),e.consume(s),e.exit(`characterReferenceMarker`),e.exit(`characterReference`),t)}return o(s)&&i++<a?(e.consume(s),u):n(s)}}var Tl={partial:!0,tokenize:Ol},El={concrete:!0,name:`codeFenced`,tokenize:Dl};function Dl(e,t,n){let r=this,i={partial:!0,tokenize:x},a=0,o=0,s;return c;function c(e){return l(e)}function l(t){let n=r.events[r.events.length-1];return a=n&&n[1].type===`linePrefix`?n[2].sliceSerialize(n[1],!0).length:0,s=t,e.enter(`codeFenced`),e.enter(`codeFencedFence`),e.enter(`codeFencedFenceSequence`),u(t)}function u(t){return t===s?(o++,e.consume(t),u):o<3?n(t):(e.exit(`codeFencedFenceSequence`),z(t)?B(e,d,`whitespace`)(t):d(t))}function d(n){return n===null||R(n)?(e.exit(`codeFencedFence`),r.interrupt?t(n):e.check(Tl,h,b)(n)):(e.enter(`codeFencedFenceInfo`),e.enter(`chunkString`,{contentType:`string`}),f(n))}function f(t){return t===null||R(t)?(e.exit(`chunkString`),e.exit(`codeFencedFenceInfo`),d(t)):z(t)?(e.exit(`chunkString`),e.exit(`codeFencedFenceInfo`),B(e,p,`whitespace`)(t)):t===96&&t===s?n(t):(e.consume(t),f)}function p(t){return t===null||R(t)?d(t):(e.enter(`codeFencedFenceMeta`),e.enter(`chunkString`,{contentType:`string`}),m(t))}function m(t){return t===null||R(t)?(e.exit(`chunkString`),e.exit(`codeFencedFenceMeta`),d(t)):t===96&&t===s?n(t):(e.consume(t),m)}function h(t){return e.attempt(i,b,g)(t)}function g(t){return e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),_}function _(t){return a>0&&z(t)?B(e,v,`linePrefix`,a+1)(t):v(t)}function v(t){return t===null||R(t)?e.check(Tl,h,b)(t):(e.enter(`codeFlowValue`),y(t))}function y(t){return t===null||R(t)?(e.exit(`codeFlowValue`),v(t)):(e.consume(t),y)}function b(n){return e.exit(`codeFenced`),t(n)}function x(e,t,n){let i=0;return a;function a(t){return e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),c}function c(t){return e.enter(`codeFencedFence`),z(t)?B(e,l,`linePrefix`,r.parser.constructs.disable.null.includes(`codeIndented`)?void 0:4)(t):l(t)}function l(t){return t===s?(e.enter(`codeFencedFenceSequence`),u(t)):n(t)}function u(t){return t===s?(i++,e.consume(t),u):i>=o?(e.exit(`codeFencedFenceSequence`),z(t)?B(e,d,`whitespace`)(t):d(t)):n(t)}function d(r){return r===null||R(r)?(e.exit(`codeFencedFence`),t(r)):n(r)}}}function Ol(e,t,n){let r=this;return i;function i(t){return t===null?n(t):(e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),a)}function a(e){return r.parser.lazy[r.now().line]?n(e):t(e)}}var kl={name:`codeIndented`,tokenize:jl},Al={partial:!0,tokenize:Ml};function jl(e,t,n){let r=this;return i;function i(t){return e.enter(`codeIndented`),B(e,a,`linePrefix`,5)(t)}function a(e){let t=r.events[r.events.length-1];return t&&t[1].type===`linePrefix`&&t[2].sliceSerialize(t[1],!0).length>=4?o(e):n(e)}function o(t){return t===null?c(t):R(t)?e.attempt(Al,o,c)(t):(e.enter(`codeFlowValue`),s(t))}function s(t){return t===null||R(t)?(e.exit(`codeFlowValue`),o(t)):(e.consume(t),s)}function c(n){return e.exit(`codeIndented`),t(n)}}function Ml(e,t,n){let r=this;return i;function i(t){return r.parser.lazy[r.now().line]?n(t):R(t)?(e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),i):B(e,a,`linePrefix`,5)(t)}function a(e){let a=r.events[r.events.length-1];return a&&a[1].type===`linePrefix`&&a[2].sliceSerialize(a[1],!0).length>=4?t(e):R(e)?i(e):n(e)}}var Nl={name:`codeText`,previous:Fl,resolve:Pl,tokenize:Il};function Pl(e){let t=e.length-4,n=3,r,i;if((e[n][1].type===`lineEnding`||e[n][1].type===`space`)&&(e[t][1].type===`lineEnding`||e[t][1].type===`space`)){for(r=n;++r<t;)if(e[r][1].type===`codeTextData`){e[n][1].type=`codeTextPadding`,e[t][1].type=`codeTextPadding`,n+=2,t-=2;break}}for(r=n-1,t++;++r<=t;)i===void 0?r!==t&&e[r][1].type!==`lineEnding`&&(i=r):(r===t||e[r][1].type===`lineEnding`)&&(e[i][1].type=`codeTextData`,r!==i+2&&(e[i][1].end=e[r-1][1].end,e.splice(i+2,r-i-2),t-=r-i-2,r=i+2),i=void 0);return e}function Fl(e){return e!==96||this.events[this.events.length-1][1].type===`characterEscape`}function Il(e,t,n){let r=0,i,a;return o;function o(t){return e.enter(`codeText`),e.enter(`codeTextSequence`),s(t)}function s(t){return t===96?(e.consume(t),r++,s):(e.exit(`codeTextSequence`),c(t))}function c(t){return t===null?n(t):t===32?(e.enter(`space`),e.consume(t),e.exit(`space`),c):t===96?(a=e.enter(`codeTextSequence`),i=0,u(t)):R(t)?(e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),c):(e.enter(`codeTextData`),l(t))}function l(t){return t===null||t===32||t===96||R(t)?(e.exit(`codeTextData`),c(t)):(e.consume(t),l)}function u(n){return n===96?(e.consume(n),i++,u):i===r?(e.exit(`codeTextSequence`),e.exit(`codeText`),t(n)):(a.type=`codeTextData`,l(n))}}var Ll=class{constructor(e){this.left=e?[...e]:[],this.right=[]}get(e){if(e<0||e>=this.left.length+this.right.length)throw RangeError("Cannot access index `"+e+"` in a splice buffer of size `"+(this.left.length+this.right.length)+"`");return e<this.left.length?this.left[e]:this.right[this.right.length-e+this.left.length-1]}get length(){return this.left.length+this.right.length}shift(){return this.setCursor(0),this.right.pop()}slice(e,t){let n=t??1/0;return n<this.left.length?this.left.slice(e,n):e>this.left.length?this.right.slice(this.right.length-n+this.left.length,this.right.length-e+this.left.length).reverse():this.left.slice(e).concat(this.right.slice(this.right.length-n+this.left.length).reverse())}splice(e,t,n){let r=t||0;this.setCursor(Math.trunc(e));let i=this.right.splice(this.right.length-r,1/0);return n&&Rl(this.left,n),i.reverse()}pop(){return this.setCursor(1/0),this.left.pop()}push(e){this.setCursor(1/0),this.left.push(e)}pushMany(e){this.setCursor(1/0),Rl(this.left,e)}unshift(e){this.setCursor(0),this.right.push(e)}unshiftMany(e){this.setCursor(0),Rl(this.right,e.reverse())}setCursor(e){if(!(e===this.left.length||e>this.left.length&&this.right.length===0||e<0&&this.left.length===0)){if(e<this.left.length){let t=this.left.splice(e,1/0);Rl(this.right,t.reverse())}else{let t=this.right.splice(this.left.length+this.right.length-e,1/0);Rl(this.left,t.reverse())}}}};function Rl(e,t){let n=0;if(t.length<1e4)e.push(...t);else for(;n<t.length;)e.push(...t.slice(n,n+1e4)),n+=1e4}function zl(e){let t={},n=-1,r,i,a,o,s,c,l,u=new Ll(e);for(;++n<u.length;){for(;n in t;)n=t[n];if(r=u.get(n),n&&r[1].type===`chunkFlow`&&u.get(n-1)[1].type===`listItemPrefix`&&(c=r[1]._tokenizer.events,a=0,a<c.length&&c[a][1].type===`lineEndingBlank`&&(a+=2),a<c.length&&c[a][1].type===`content`))for(;++a<c.length&&c[a][1].type!==`content`;)c[a][1].type===`chunkText`&&(c[a][1]._isInFirstContentOfListItem=!0,a++);if(r[0]===`enter`)r[1].contentType&&(Object.assign(t,Bl(u,n)),n=t[n],l=!0);else if(r[1]._container){for(a=n,i=void 0;a--;)if(o=u.get(a),o[1].type===`lineEnding`||o[1].type===`lineEndingBlank`)o[0]===`enter`&&(i&&(u.get(i)[1].type=`lineEndingBlank`),o[1].type=`lineEnding`,i=a);else if(o[1].type!==`linePrefix`&&o[1].type!==`listItemIndent`)break;i&&(r[1].end={...u.get(i)[1].start},s=u.slice(i,n),s.unshift(r),u.splice(i,n-i+1,s))}}return Ic(e,0,1/0,u.slice(0)),!l}function Bl(e,t){let n=e.get(t)[1],r=e.get(t)[2],i=t-1,a=[],o=n._tokenizer;o||(o=r.parser[n.contentType](n.start),n._contentTypeTextTrailing&&(o._contentTypeTextTrailing=!0));let s=o.events,c=[],l={},u,d,f=-1,p=n,m=0,h=0,g=[h];for(;p;){for(;e.get(++i)[1]!==p;);a.push(i),p._tokenizer||(u=r.sliceStream(p),p.next||u.push(null),d&&o.defineSkip(p.start),p._isInFirstContentOfListItem&&(o._gfmTasklistFirstContentOfListItem=!0),o.write(u),p._isInFirstContentOfListItem&&(o._gfmTasklistFirstContentOfListItem=void 0)),d=p,p=p.next}for(p=n;++f<s.length;)s[f][0]===`exit`&&s[f-1][0]===`enter`&&s[f][1].type===s[f-1][1].type&&s[f][1].start.line!==s[f][1].end.line&&(h=f+1,g.push(h),p._tokenizer=void 0,p.previous=void 0,p=p.next);for(o.events=[],p?(p._tokenizer=void 0,p.previous=void 0):g.pop(),f=g.length;f--;){let t=s.slice(g[f],g[f+1]),n=a.pop();c.push([n,n+t.length-1]),e.splice(n,2,t)}for(c.reverse(),f=-1;++f<c.length;)l[m+c[f][0]]=m+c[f][1],m+=c[f][1]-c[f][0]-1;return l}var Vl={resolve:Ul,tokenize:V},Hl={partial:!0,tokenize:Wl};function Ul(e){return zl(e),e}function V(e,t){let n;return r;function r(t){return e.enter(`content`),n=e.enter(`chunkContent`,{contentType:`content`}),i(t)}function i(t){return t===null?a(t):R(t)?e.check(Hl,o,a)(t):(e.consume(t),i)}function a(n){return e.exit(`chunkContent`),e.exit(`content`),t(n)}function o(t){return e.consume(t),e.exit(`chunkContent`),n.next=e.enter(`chunkContent`,{contentType:`content`,previous:n}),n=n.next,i}}function Wl(e,t,n){let r=this;return i;function i(t){return e.exit(`chunkContent`),e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),B(e,a,`linePrefix`)}function a(i){if(i===null||R(i))return n(i);let a=r.events[r.events.length-1];return!r.parser.constructs.disable.null.includes(`codeIndented`)&&a&&a[1].type===`linePrefix`&&a[2].sliceSerialize(a[1],!0).length>=4?t(i):e.interrupt(r.parser.constructs.flow,n,t)(i)}}function H(e,t,n,r,i,a,o,s,c){let l=c||1/0,u=0;return d;function d(t){return t===60?(e.enter(r),e.enter(i),e.enter(a),e.consume(t),e.exit(a),f):t===null||t===32||t===41||Kc(t)?n(t):(e.enter(r),e.enter(o),e.enter(s),e.enter(`chunkString`,{contentType:`string`}),h(t))}function f(n){return n===62?(e.enter(a),e.consume(n),e.exit(a),e.exit(i),e.exit(r),t):(e.enter(s),e.enter(`chunkString`,{contentType:`string`}),p(n))}function p(t){return t===62?(e.exit(`chunkString`),e.exit(s),f(t)):t===null||t===60||R(t)?n(t):(e.consume(t),t===92?m:p)}function m(t){return t===60||t===62||t===92?(e.consume(t),p):p(t)}function h(i){return!u&&(i===null||i===41||Xc(i))?(e.exit(`chunkString`),e.exit(s),e.exit(o),e.exit(r),t(i)):u<l&&i===40?(e.consume(i),u++,h):i===41?(e.consume(i),u--,h):i===null||i===32||i===40||Kc(i)?n(i):(e.consume(i),i===92?g:h)}function g(t){return t===40||t===41||t===92?(e.consume(t),h):h(t)}}function U(e,t,n,r,i,a){let o=this,s=0,c;return l;function l(t){return e.enter(r),e.enter(i),e.consume(t),e.exit(i),e.enter(a),u}function u(l){return s>999||l===null||l===91||l===93&&!c||l===94&&!s&&`_hiddenFootnoteSupport`in o.parser.constructs?n(l):l===93?(e.exit(a),e.enter(i),e.consume(l),e.exit(i),e.exit(r),t):R(l)?(e.enter(`lineEnding`),e.consume(l),e.exit(`lineEnding`),u):(e.enter(`chunkString`,{contentType:`string`}),d(l))}function d(t){return t===null||t===91||t===93||R(t)||s++>999?(e.exit(`chunkString`),u(t)):(e.consume(t),c||=!z(t),t===92?f:d)}function f(t){return t===91||t===92||t===93?(e.consume(t),s++,d):d(t)}}function Gl(e,t,n,r,i,a){let o;return s;function s(t){return t===34||t===39||t===40?(e.enter(r),e.enter(i),e.consume(t),e.exit(i),o=t===40?41:t,c):n(t)}function c(n){return n===o?(e.enter(i),e.consume(n),e.exit(i),e.exit(r),t):(e.enter(a),l(n))}function l(t){return t===o?(e.exit(a),c(o)):t===null?n(t):R(t)?(e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),B(e,l,`linePrefix`)):(e.enter(`chunkString`,{contentType:`string`}),u(t))}function u(t){return t===o||t===null||R(t)?(e.exit(`chunkString`),l(t)):(e.consume(t),t===92?d:u)}function d(t){return t===o||t===92?(e.consume(t),u):u(t)}}function Kl(e,t){let n;return r;function r(i){return R(i)?(e.enter(`lineEnding`),e.consume(i),e.exit(`lineEnding`),n=!0,r):z(i)?B(e,r,n?`linePrefix`:`lineSuffix`)(i):t(i)}}var ql={name:`definition`,tokenize:Yl},Jl={partial:!0,tokenize:Xl};function Yl(e,t,n){let r=this,i;return a;function a(t){return e.enter(`definition`),o(t)}function o(t){return U.call(r,e,s,n,`definitionLabel`,`definitionLabelMarker`,`definitionLabelString`)(t)}function s(t){return i=Uc(r.sliceSerialize(r.events[r.events.length-1][1]).slice(1,-1)),t===58?(e.enter(`definitionMarker`),e.consume(t),e.exit(`definitionMarker`),c):n(t)}function c(t){return Xc(t)?Kl(e,l)(t):l(t)}function l(t){return H(e,u,n,`definitionDestination`,`definitionDestinationLiteral`,`definitionDestinationLiteralMarker`,`definitionDestinationRaw`,`definitionDestinationString`)(t)}function u(t){return e.attempt(Jl,d,d)(t)}function d(t){return z(t)?B(e,f,`whitespace`)(t):f(t)}function f(a){return a===null||R(a)?(e.exit(`definition`),r.parser.defined.push(i),t(a)):n(a)}}function Xl(e,t,n){return r;function r(t){return Xc(t)?Kl(e,i)(t):n(t)}function i(t){return Gl(e,a,n,`definitionTitle`,`definitionTitleMarker`,`definitionTitleString`)(t)}function a(t){return z(t)?B(e,o,`whitespace`)(t):o(t)}function o(e){return e===null||R(e)?t(e):n(e)}}var Zl={name:`hardBreakEscape`,tokenize:Ql};function Ql(e,t,n){return r;function r(t){return e.enter(`hardBreakEscape`),e.consume(t),i}function i(r){return R(r)?(e.exit(`hardBreakEscape`),t(r)):n(r)}}var $l={name:`headingAtx`,resolve:eu,tokenize:tu};function eu(e,t){let n=e.length-2,r=3,i,a;return e[r][1].type===`whitespace`&&(r+=2),n-2>r&&e[n][1].type===`whitespace`&&(n-=2),e[n][1].type===`atxHeadingSequence`&&(r===n-1||n-4>r&&e[n-2][1].type===`whitespace`)&&(n-=r+1===n?2:4),n>r&&(i={type:`atxHeadingText`,start:e[r][1].start,end:e[n][1].end},a={type:`chunkText`,start:e[r][1].start,end:e[n][1].end,contentType:`text`},Ic(e,r,n-r+1,[[`enter`,i,t],[`enter`,a,t],[`exit`,a,t],[`exit`,i,t]])),e}function tu(e,t,n){let r=0;return i;function i(t){return e.enter(`atxHeading`),a(t)}function a(t){return e.enter(`atxHeadingSequence`),o(t)}function o(t){return t===35&&r++<6?(e.consume(t),o):t===null||Xc(t)?(e.exit(`atxHeadingSequence`),s(t)):n(t)}function s(n){return n===35?(e.enter(`atxHeadingSequence`),c(n)):n===null||R(n)?(e.exit(`atxHeading`),t(n)):z(n)?B(e,s,`whitespace`)(n):(e.enter(`atxHeadingText`),l(n))}function c(t){return t===35?(e.consume(t),c):(e.exit(`atxHeadingSequence`),s(t))}function l(t){return t===null||t===35||Xc(t)?(e.exit(`atxHeadingText`),s(t)):(e.consume(t),l)}}var nu=`address.article.aside.base.basefont.blockquote.body.caption.center.col.colgroup.dd.details.dialog.dir.div.dl.dt.fieldset.figcaption.figure.footer.form.frame.frameset.h1.h2.h3.h4.h5.h6.head.header.hr.html.iframe.legend.li.link.main.menu.menuitem.nav.noframes.ol.optgroup.option.p.param.search.section.summary.table.tbody.td.tfoot.th.thead.title.tr.track.ul`.split(`.`),ru=[`pre`,`script`,`style`,`textarea`],iu={concrete:!0,name:`htmlFlow`,resolveTo:su,tokenize:cu},au={partial:!0,tokenize:uu},ou={partial:!0,tokenize:lu};function su(e){let t=e.length;for(;t--&&(e[t][0]!==`enter`||e[t][1].type!==`htmlFlow`););return t>1&&e[t-2][1].type===`linePrefix`&&(e[t][1].start=e[t-2][1].start,e[t+1][1].start=e[t-2][1].start,e.splice(t-2,2)),e}function cu(e,t,n){let r=this,i,a,o,s,c;return l;function l(e){return u(e)}function u(t){return e.enter(`htmlFlow`),e.enter(`htmlFlowData`),e.consume(t),d}function d(s){return s===33?(e.consume(s),f):s===47?(e.consume(s),a=!0,h):s===63?(e.consume(s),i=3,r.interrupt?t:k):Wc(s)?(e.consume(s),o=String.fromCharCode(s),g):n(s)}function f(a){return a===45?(e.consume(a),i=2,p):a===91?(e.consume(a),i=5,s=0,m):Wc(a)?(e.consume(a),i=4,r.interrupt?t:k):n(a)}function p(i){return i===45?(e.consume(i),r.interrupt?t:k):n(i)}function m(i){return i===`CDATA[`.charCodeAt(s++)?(e.consume(i),s===6?r.interrupt?t:D:m):n(i)}function h(t){return Wc(t)?(e.consume(t),o=String.fromCharCode(t),g):n(t)}function g(s){if(s===null||s===47||s===62||Xc(s)){let c=s===47,l=o.toLowerCase();return!c&&!a&&ru.includes(l)?(i=1,r.interrupt?t(s):D(s)):nu.includes(o.toLowerCase())?(i=6,c?(e.consume(s),_):r.interrupt?t(s):D(s)):(i=7,r.interrupt&&!r.parser.lazy[r.now().line]?n(s):a?v(s):y(s))}return s===45||L(s)?(e.consume(s),o+=String.fromCharCode(s),g):n(s)}function _(i){return i===62?(e.consume(i),r.interrupt?t:D):n(i)}function v(t){return z(t)?(e.consume(t),v):E(t)}function y(t){return t===47?(e.consume(t),E):t===58||t===95||Wc(t)?(e.consume(t),b):z(t)?(e.consume(t),y):E(t)}function b(t){return t===45||t===46||t===58||t===95||L(t)?(e.consume(t),b):x(t)}function x(t){return t===61?(e.consume(t),S):z(t)?(e.consume(t),x):y(t)}function S(t){return t===null||t===60||t===61||t===62||t===96?n(t):t===34||t===39?(e.consume(t),c=t,C):z(t)?(e.consume(t),S):w(t)}function C(t){return t===c?(e.consume(t),c=null,T):t===null||R(t)?n(t):(e.consume(t),C)}function w(t){return t===null||t===34||t===39||t===47||t===60||t===61||t===62||t===96||Xc(t)?x(t):(e.consume(t),w)}function T(e){return e===47||e===62||z(e)?y(e):n(e)}function E(t){return t===62?(e.consume(t),ee):n(t)}function ee(t){return t===null||R(t)?D(t):z(t)?(e.consume(t),ee):n(t)}function D(t){return t===45&&i===2?(e.consume(t),re):t===60&&i===1?(e.consume(t),ie):t===62&&i===4?(e.consume(t),A):t===63&&i===3?(e.consume(t),k):t===93&&i===5?(e.consume(t),oe):R(t)&&(i===6||i===7)?(e.exit(`htmlFlowData`),e.check(au,se,O)(t)):t===null||R(t)?(e.exit(`htmlFlowData`),O(t)):(e.consume(t),D)}function O(t){return e.check(ou,te,se)(t)}function te(t){return e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),ne}function ne(t){return t===null||R(t)?O(t):(e.enter(`htmlFlowData`),D(t))}function re(t){return t===45?(e.consume(t),k):D(t)}function ie(t){return t===47?(e.consume(t),o=``,ae):D(t)}function ae(t){if(t===62){let n=o.toLowerCase();return ru.includes(n)?(e.consume(t),A):D(t)}return Wc(t)&&o.length<8?(e.consume(t),o+=String.fromCharCode(t),ae):D(t)}function oe(t){return t===93?(e.consume(t),k):D(t)}function k(t){return t===62?(e.consume(t),A):t===45&&i===2?(e.consume(t),k):D(t)}function A(t){return t===null||R(t)?(e.exit(`htmlFlowData`),se(t)):(e.consume(t),A)}function se(n){return e.exit(`htmlFlow`),t(n)}}function lu(e,t,n){let r=this;return i;function i(t){return R(t)?(e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),a):n(t)}function a(e){return r.parser.lazy[r.now().line]?n(e):t(e)}}function uu(e,t,n){return r;function r(r){return e.enter(`lineEnding`),e.consume(r),e.exit(`lineEnding`),e.attempt(hl,t,n)}}var du={name:`htmlText`,tokenize:fu};function fu(e,t,n){let r=this,i,a,o;return s;function s(t){return e.enter(`htmlText`),e.enter(`htmlTextData`),e.consume(t),c}function c(t){return t===33?(e.consume(t),l):t===47?(e.consume(t),x):t===63?(e.consume(t),y):Wc(t)?(e.consume(t),w):n(t)}function l(t){return t===45?(e.consume(t),u):t===91?(e.consume(t),a=0,m):Wc(t)?(e.consume(t),v):n(t)}function u(t){return t===45?(e.consume(t),p):n(t)}function d(t){return t===null?n(t):t===45?(e.consume(t),f):R(t)?(o=d,ie(t)):(e.consume(t),d)}function f(t){return t===45?(e.consume(t),p):d(t)}function p(e){return e===62?re(e):e===45?f(e):d(e)}function m(t){return t===`CDATA[`.charCodeAt(a++)?(e.consume(t),a===6?h:m):n(t)}function h(t){return t===null?n(t):t===93?(e.consume(t),g):R(t)?(o=h,ie(t)):(e.consume(t),h)}function g(t){return t===93?(e.consume(t),_):h(t)}function _(t){return t===62?re(t):t===93?(e.consume(t),_):h(t)}function v(t){return t===null||t===62?re(t):R(t)?(o=v,ie(t)):(e.consume(t),v)}function y(t){return t===null?n(t):t===63?(e.consume(t),b):R(t)?(o=y,ie(t)):(e.consume(t),y)}function b(e){return e===62?re(e):y(e)}function x(t){return Wc(t)?(e.consume(t),S):n(t)}function S(t){return t===45||L(t)?(e.consume(t),S):C(t)}function C(t){return R(t)?(o=C,ie(t)):z(t)?(e.consume(t),C):re(t)}function w(t){return t===45||L(t)?(e.consume(t),w):t===47||t===62||Xc(t)?T(t):n(t)}function T(t){return t===47?(e.consume(t),re):t===58||t===95||Wc(t)?(e.consume(t),E):R(t)?(o=T,ie(t)):z(t)?(e.consume(t),T):re(t)}function E(t){return t===45||t===46||t===58||t===95||L(t)?(e.consume(t),E):ee(t)}function ee(t){return t===61?(e.consume(t),D):R(t)?(o=ee,ie(t)):z(t)?(e.consume(t),ee):T(t)}function D(t){return t===null||t===60||t===61||t===62||t===96?n(t):t===34||t===39?(e.consume(t),i=t,O):R(t)?(o=D,ie(t)):z(t)?(e.consume(t),D):(e.consume(t),te)}function O(t){return t===i?(e.consume(t),i=void 0,ne):t===null?n(t):R(t)?(o=O,ie(t)):(e.consume(t),O)}function te(t){return t===null||t===34||t===39||t===60||t===61||t===96?n(t):t===47||t===62||Xc(t)?T(t):(e.consume(t),te)}function ne(e){return e===47||e===62||Xc(e)?T(e):n(e)}function re(r){return r===62?(e.consume(r),e.exit(`htmlTextData`),e.exit(`htmlText`),t):n(r)}function ie(t){return e.exit(`htmlTextData`),e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),ae}function ae(t){return z(t)?B(e,oe,`linePrefix`,r.parser.constructs.disable.null.includes(`codeIndented`)?void 0:4)(t):oe(t)}function oe(t){return e.enter(`htmlTextData`),o(t)}}var pu={name:`labelEnd`,resolveAll:_u,resolveTo:vu,tokenize:yu},mu={tokenize:bu},hu={tokenize:xu},gu={tokenize:Su};function _u(e){let t=-1,n=[];for(;++t<e.length;){let r=e[t][1];if(n.push(e[t]),r.type===`labelImage`||r.type===`labelLink`||r.type===`labelEnd`){let e=r.type===`labelImage`?4:2;r.type=`data`,t+=e}}return e.length!==n.length&&Ic(e,0,e.length,n),e}function vu(e,t){let n=e.length,r=0,i,a,o,s;for(;n--;)if(i=e[n][1],a){if(i.type===`link`||i.type===`labelLink`&&i._inactive)break;e[n][0]===`enter`&&i.type===`labelLink`&&(i._inactive=!0)}else if(o){if(e[n][0]===`enter`&&(i.type===`labelImage`||i.type===`labelLink`)&&!i._balanced&&(a=n,i.type!==`labelLink`)){r=2;break}}else i.type===`labelEnd`&&(o=n);let c={type:e[a][1].type===`labelLink`?`link`:`image`,start:{...e[a][1].start},end:{...e[e.length-1][1].end}},l={type:`label`,start:{...e[a][1].start},end:{...e[o][1].end}},u={type:`labelText`,start:{...e[a+r+2][1].end},end:{...e[o-2][1].start}};return s=[[`enter`,c,t],[`enter`,l,t]],s=Lc(s,e.slice(a+1,a+r+3)),s=Lc(s,[[`enter`,u,t]]),s=Lc(s,cl(t.parser.constructs.insideSpan.null,e.slice(a+r+4,o-3),t)),s=Lc(s,[[`exit`,u,t],e[o-2],e[o-1],[`exit`,l,t]]),s=Lc(s,e.slice(o+1)),s=Lc(s,[[`exit`,c,t]]),Ic(e,a,e.length,s),e}function yu(e,t,n){let r=this,i=r.events.length,a,o;for(;i--;)if((r.events[i][1].type===`labelImage`||r.events[i][1].type===`labelLink`)&&!r.events[i][1]._balanced){a=r.events[i][1];break}return s;function s(t){return a?a._inactive?d(t):(o=r.parser.defined.includes(Uc(r.sliceSerialize({start:a.end,end:r.now()}))),e.enter(`labelEnd`),e.enter(`labelMarker`),e.consume(t),e.exit(`labelMarker`),e.exit(`labelEnd`),c):n(t)}function c(t){return t===40?e.attempt(mu,u,o?u:d)(t):t===91?e.attempt(hu,u,o?l:d)(t):o?u(t):d(t)}function l(t){return e.attempt(gu,u,d)(t)}function u(e){return t(e)}function d(e){return a._balanced=!0,n(e)}}function bu(e,t,n){return r;function r(t){return e.enter(`resource`),e.enter(`resourceMarker`),e.consume(t),e.exit(`resourceMarker`),i}function i(t){return Xc(t)?Kl(e,a)(t):a(t)}function a(t){return t===41?u(t):H(e,o,s,`resourceDestination`,`resourceDestinationLiteral`,`resourceDestinationLiteralMarker`,`resourceDestinationRaw`,`resourceDestinationString`,32)(t)}function o(t){return Xc(t)?Kl(e,c)(t):u(t)}function s(e){return n(e)}function c(t){return t===34||t===39||t===40?Gl(e,l,n,`resourceTitle`,`resourceTitleMarker`,`resourceTitleString`)(t):u(t)}function l(t){return Xc(t)?Kl(e,u)(t):u(t)}function u(r){return r===41?(e.enter(`resourceMarker`),e.consume(r),e.exit(`resourceMarker`),e.exit(`resource`),t):n(r)}}function xu(e,t,n){let r=this;return i;function i(t){return U.call(r,e,a,o,`reference`,`referenceMarker`,`referenceString`)(t)}function a(e){return r.parser.defined.includes(Uc(r.sliceSerialize(r.events[r.events.length-1][1]).slice(1,-1)))?t(e):n(e)}function o(e){return n(e)}}function Su(e,t,n){return r;function r(t){return e.enter(`reference`),e.enter(`referenceMarker`),e.consume(t),e.exit(`referenceMarker`),i}function i(r){return r===93?(e.enter(`referenceMarker`),e.consume(r),e.exit(`referenceMarker`),e.exit(`reference`),t):n(r)}}var Cu={name:`labelStartImage`,resolveAll:pu.resolveAll,tokenize:wu};function wu(e,t,n){let r=this;return i;function i(t){return e.enter(`labelImage`),e.enter(`labelImageMarker`),e.consume(t),e.exit(`labelImageMarker`),a}function a(t){return t===91?(e.enter(`labelMarker`),e.consume(t),e.exit(`labelMarker`),e.exit(`labelImage`),o):n(t)}function o(e){return e===94&&`_hiddenFootnoteSupport`in r.parser.constructs?n(e):t(e)}}var Tu={name:`labelStartLink`,resolveAll:pu.resolveAll,tokenize:Eu};function Eu(e,t,n){let r=this;return i;function i(t){return e.enter(`labelLink`),e.enter(`labelMarker`),e.consume(t),e.exit(`labelMarker`),e.exit(`labelLink`),a}function a(e){return e===94&&`_hiddenFootnoteSupport`in r.parser.constructs?n(e):t(e)}}var Du={name:`lineEnding`,tokenize:Ou};function Ou(e,t){return n;function n(n){return e.enter(`lineEnding`),e.consume(n),e.exit(`lineEnding`),B(e,t,`linePrefix`)}}var ku={name:`thematicBreak`,tokenize:Au};function Au(e,t,n){let r=0,i;return a;function a(t){return e.enter(`thematicBreak`),o(t)}function o(e){return i=e,s(e)}function s(a){return a===i?(e.enter(`thematicBreakSequence`),c(a)):r>=3&&(a===null||R(a))?(e.exit(`thematicBreak`),t(a)):n(a)}function c(t){return t===i?(e.consume(t),r++,c):(e.exit(`thematicBreakSequence`),z(t)?B(e,s,`whitespace`)(t):s(t))}}var ju={continuation:{tokenize:Fu},exit:Lu,name:`list`,tokenize:Pu},Mu={partial:!0,tokenize:Ru},Nu={partial:!0,tokenize:Iu};function Pu(e,t,n){let r=this,i=r.events[r.events.length-1],a=i&&i[1].type===`linePrefix`?i[2].sliceSerialize(i[1],!0).length:0,o=0;return s;function s(t){let i=r.containerState.type||(t===42||t===43||t===45?`listUnordered`:`listOrdered`);if(i===`listUnordered`?!r.containerState.marker||t===r.containerState.marker:qc(t)){if(r.containerState.type||(r.containerState.type=i,e.enter(i,{_container:!0})),i===`listUnordered`)return e.enter(`listItemPrefix`),t===42||t===45?e.check(ku,n,l)(t):l(t);if(!r.interrupt||t===49)return e.enter(`listItemPrefix`),e.enter(`listItemValue`),c(t)}return n(t)}function c(t){return qc(t)&&++o<10?(e.consume(t),c):(!r.interrupt||o<2)&&(r.containerState.marker?t===r.containerState.marker:t===41||t===46)?(e.exit(`listItemValue`),l(t)):n(t)}function l(t){return e.enter(`listItemMarker`),e.consume(t),e.exit(`listItemMarker`),r.containerState.marker=r.containerState.marker||t,e.check(hl,r.interrupt?n:u,e.attempt(Mu,f,d))}function u(e){return r.containerState.initialBlankLine=!0,a++,f(e)}function d(t){return z(t)?(e.enter(`listItemPrefixWhitespace`),e.consume(t),e.exit(`listItemPrefixWhitespace`),f):n(t)}function f(n){return r.containerState.size=a+r.sliceSerialize(e.exit(`listItemPrefix`),!0).length,t(n)}}function Fu(e,t,n){let r=this;return r.containerState._closeFlow=void 0,e.check(hl,i,a);function i(n){return r.containerState.furtherBlankLines=r.containerState.furtherBlankLines||r.containerState.initialBlankLine,B(e,t,`listItemIndent`,r.containerState.size+1)(n)}function a(n){return r.containerState.furtherBlankLines||!z(n)?(r.containerState.furtherBlankLines=void 0,r.containerState.initialBlankLine=void 0,o(n)):(r.containerState.furtherBlankLines=void 0,r.containerState.initialBlankLine=void 0,e.attempt(Nu,t,o)(n))}function o(i){return r.containerState._closeFlow=!0,r.interrupt=void 0,B(e,e.attempt(ju,t,n),`linePrefix`,r.parser.constructs.disable.null.includes(`codeIndented`)?void 0:4)(i)}}function Iu(e,t,n){let r=this;return B(e,i,`listItemIndent`,r.containerState.size+1);function i(e){let i=r.events[r.events.length-1];return i&&i[1].type===`listItemIndent`&&i[2].sliceSerialize(i[1],!0).length===r.containerState.size?t(e):n(e)}}function Lu(e){e.exit(this.containerState.type)}function Ru(e,t,n){let r=this;return B(e,i,`listItemPrefixWhitespace`,r.parser.constructs.disable.null.includes(`codeIndented`)?void 0:5);function i(e){let i=r.events[r.events.length-1];return!z(e)&&i&&i[1].type===`listItemPrefixWhitespace`?t(e):n(e)}}var zu={name:`setextUnderline`,resolveTo:Bu,tokenize:Vu};function Bu(e,t){let n=e.length,r,i,a;for(;n--;)if(e[n][0]===`enter`){if(e[n][1].type===`content`){r=n;break}e[n][1].type===`paragraph`&&(i=n)}else e[n][1].type===`content`&&e.splice(n,1),!a&&e[n][1].type===`definition`&&(a=n);let o={type:`setextHeading`,start:{...e[r][1].start},end:{...e[e.length-1][1].end}};return e[i][1].type=`setextHeadingText`,a?(e.splice(i,0,[`enter`,o,t]),e.splice(a+1,0,[`exit`,e[r][1],t]),e[r][1].end={...e[a][1].end}):e[r][1]=o,e.push([`exit`,o,t]),e}function Vu(e,t,n){let r=this,i;return a;function a(t){let a=r.events.length,s;for(;a--;)if(r.events[a][1].type!==`lineEnding`&&r.events[a][1].type!==`linePrefix`&&r.events[a][1].type!==`content`){s=r.events[a][1].type===`paragraph`;break}return!r.parser.lazy[r.now().line]&&(r.interrupt||s)?(e.enter(`setextHeadingLine`),i=t,o(t)):n(t)}function o(t){return e.enter(`setextHeadingLineSequence`),s(t)}function s(t){return t===i?(e.consume(t),s):(e.exit(`setextHeadingLineSequence`),z(t)?B(e,c,`lineSuffix`)(t):c(t))}function c(r){return r===null||R(r)?(e.exit(`setextHeadingLine`),t(r)):n(r)}}var Hu={tokenize:Uu};function Uu(e){let t=this,n=e.attempt(hl,r,e.attempt(this.parser.constructs.flowInitial,i,B(e,e.attempt(this.parser.constructs.flow,i,e.attempt(Vl,i)),`linePrefix`)));return n;function r(r){if(r===null){e.consume(r);return}return e.enter(`lineEndingBlank`),e.consume(r),e.exit(`lineEndingBlank`),t.currentConstruct=void 0,n}function i(r){if(r===null){e.consume(r);return}return e.enter(`lineEnding`),e.consume(r),e.exit(`lineEnding`),t.currentConstruct=void 0,n}}var Wu={resolveAll:Ju()},Gu=qu(`string`),Ku=qu(`text`);function qu(e){return{resolveAll:Ju(e===`text`?Yu:void 0),tokenize:t};function t(t){let n=this,r=this.parser.constructs[e],i=t.attempt(r,a,o);return a;function a(e){return c(e)?i(e):o(e)}function o(e){if(e===null){t.consume(e);return}return t.enter(`data`),t.consume(e),s}function s(e){return c(e)?(t.exit(`data`),i(e)):(t.consume(e),s)}function c(e){if(e===null)return!0;let t=r[e],i=-1;if(t)for(;++i<t.length;){let e=t[i];if(!e.previous||e.previous.call(n,n.previous))return!0}return!1}}}function Ju(e){return t;function t(t,n){let r=-1,i;for(;++r<=t.length;)i===void 0?t[r]&&t[r][1].type===`data`&&(i=r,r++):(!t[r]||t[r][1].type!==`data`)&&(r!==i+2&&(t[i][1].end=t[r-1][1].end,t.splice(i+2,r-i-2),r=i+2),i=void 0);return e?e(t,n):t}}function Yu(e,t){let n=0;for(;++n<=e.length;)if((n===e.length||e[n][1].type===`lineEnding`)&&e[n-1][1].type===`data`){let r=e[n-1][1],i=t.sliceStream(r),a=i.length,o=-1,s=0,c;for(;a--;){let e=i[a];if(typeof e==`string`){for(o=e.length;e.charCodeAt(o-1)===32;)s++,o--;if(o)break;o=-1}else if(e===-2)c=!0,s++;else if(e!==-1){a++;break}}if(t._contentTypeTextTrailing&&n===e.length&&(s=0),s){let i={type:n===e.length||c||s<2?`lineSuffix`:`hardBreakTrailing`,start:{_bufferIndex:a?o:r.start._bufferIndex+o,_index:r.start._index+a,line:r.end.line,column:r.end.column-s,offset:r.end.offset-s},end:{...r.end}};r.end={...i.start},r.start.offset===r.end.offset?Object.assign(r,i):(e.splice(n,0,[`enter`,i,t],[`exit`,i,t]),n+=2)}n++}return e}var Xu=s({attentionMarkers:()=>id,contentInitial:()=>Qu,disable:()=>ad,document:()=>Zu,flow:()=>ed,flowInitial:()=>$u,insideSpan:()=>rd,string:()=>td,text:()=>nd}),Zu={42:ju,43:ju,45:ju,48:ju,49:ju,50:ju,51:ju,52:ju,53:ju,54:ju,55:ju,56:ju,57:ju,62:_l},Qu={91:ql},$u={[-2]:kl,[-1]:kl,32:kl},ed={35:$l,42:ku,45:[zu,ku],60:iu,61:zu,95:ku,96:El,126:El},td={38:Cl,92:xl},nd={[-5]:Du,[-4]:Du,[-3]:Du,33:Cu,38:Cl,42:ll,60:[pl,du],91:Tu,92:[Zl,xl],93:pu,95:ll,96:Nl},rd={null:[ll,Wu]},id={null:[42,95]},ad={null:[]};function od(e,t,n){let r={_bufferIndex:-1,_index:0,line:n&&n.line||1,column:n&&n.column||1,offset:n&&n.offset||0},i={},a=[],o=[],s=[],c={attempt:C(x),check:C(S),consume:v,enter:y,exit:b,interrupt:C(S,{interrupt:!0})},l={code:null,containerState:{},defineSkip:h,events:[],now:m,parser:e,previous:null,sliceSerialize:f,sliceStream:p,write:d},u=t.tokenize.call(l,c);return t.resolveAll&&a.push(t),l;function d(e){return o=Lc(o,e),g(),o[o.length-1]===null?(w(t,0),l.events=cl(a,l.events,l),l.events):[]}function f(e,t){return cd(p(e),t)}function p(e){return sd(o,e)}function m(){let{_bufferIndex:e,_index:t,line:n,column:i,offset:a}=r;return{_bufferIndex:e,_index:t,line:n,column:i,offset:a}}function h(e){i[e.line]=e.column,E()}function g(){let e;for(;r._index<o.length;){let t=o[r._index];if(typeof t==`string`)for(e=r._index,r._bufferIndex<0&&(r._bufferIndex=0);r._index===e&&r._bufferIndex<t.length;)_(t.charCodeAt(r._bufferIndex));else _(t)}}function _(e){u=u(e)}function v(e){R(e)?(r.line++,r.column=1,r.offset+=e===-3?2:1,E()):e!==-1&&(r.column++,r.offset++),r._bufferIndex<0?r._index++:(r._bufferIndex++,r._bufferIndex===o[r._index].length&&(r._bufferIndex=-1,r._index++)),l.previous=e}function y(e,t){let n=t||{};return n.type=e,n.start=m(),l.events.push([`enter`,n,l]),s.push(n),n}function b(e){let t=s.pop();return t.end=m(),l.events.push([`exit`,t,l]),t}function x(e,t){w(e,t.from)}function S(e,t){t.restore()}function C(e,t){return n;function n(n,r,i){let a,o,s,u;return Array.isArray(n)?f(n):`tokenize`in n?f([n]):d(n);function d(e){return t;function t(t){let n=t!==null&&e[t],r=t!==null&&e.null;return f([...Array.isArray(n)?n:n?[n]:[],...Array.isArray(r)?r:r?[r]:[]])(t)}}function f(e){return a=e,o=0,e.length===0?i:p(e[o])}function p(e){return n;function n(n){return u=T(),s=e,e.partial||(l.currentConstruct=e),e.name&&l.parser.constructs.disable.null.includes(e.name)?h(n):e.tokenize.call(t?Object.assign(Object.create(l),t):l,c,m,h)(n)}}function m(t){return e(s,u),r}function h(e){return u.restore(),++o<a.length?p(a[o]):i}}}function w(e,t){e.resolveAll&&!a.includes(e)&&a.push(e),e.resolve&&Ic(l.events,t,l.events.length-t,e.resolve(l.events.slice(t),l)),e.resolveTo&&(l.events=e.resolveTo(l.events,l))}function T(){let e=m(),t=l.previous,n=l.currentConstruct,i=l.events.length,a=Array.from(s);return{from:i,restore:o};function o(){r=e,l.previous=t,l.currentConstruct=n,l.events.length=i,s=a,E()}}function E(){r.line in i&&r.column<2&&(r.column=i[r.line],r.offset+=i[r.line]-1)}}function sd(e,t){let n=t.start._index,r=t.start._bufferIndex,i=t.end._index,a=t.end._bufferIndex,o;if(n===i)o=[e[n].slice(r,a)];else{if(o=e.slice(n,i),r>-1){let e=o[0];typeof e==`string`?o[0]=e.slice(r):o.shift()}a>0&&o.push(e[i].slice(0,a))}return o}function cd(e,t){let n=-1,r=[],i;for(;++n<e.length;){let a=e[n],o;if(typeof a==`string`)o=a;else switch(a){case-5:o=`\r`;break;case-4:o=`
`;break;case-3:o=`\r
`;break;case-2:o=t?` `:`	`;break;case-1:if(!t&&i)continue;o=` `;break;default:o=String.fromCharCode(a)}i=a===-2,r.push(o)}return r.join(``)}function ld(e){let t={constructs:zc([Xu,...(e||{}).extensions||[]]),content:n(tl),defined:[],document:n(rl),flow:n(Hu),lazy:{},string:n(Gu),text:n(Ku)};return t;function n(e){return n;function n(n){return od(t,e,n)}}}function ud(e){for(;!zl(e););return e}var dd=/[\0\t\n\r]/g;function fd(){let e=1,t=``,n=!0,r;return i;function i(i,a,o){let s=[],c,l,u,d,f;for(i=t+(typeof i==`string`?i.toString():new TextDecoder(a||void 0).decode(i)),u=0,t=``,n&&=(i.charCodeAt(0)===65279&&u++,void 0);u<i.length;){if(dd.lastIndex=u,c=dd.exec(i),d=c&&c.index!==void 0?c.index:i.length,f=i.charCodeAt(d),!c){t=i.slice(u);break}if(f===10&&u===d&&r)s.push(-3),r=void 0;else switch(r&&=(s.push(-5),void 0),u<d&&(s.push(i.slice(u,d)),e+=d-u),f){case 0:s.push(65533),e++;break;case 9:for(l=Math.ceil(e/4)*4,s.push(-2);e++<l;)s.push(-1);break;case 10:s.push(-4),e=1;break;default:r=!0,e=1}u=d+1}return o&&(r&&s.push(-5),t&&s.push(t),s.push(null)),s}}var pd=/\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;function md(e){return e.replace(pd,hd)}function hd(e,t,n){if(t)return t;if(n.charCodeAt(0)===35){let e=n.charCodeAt(1),t=e===120||e===88;return Hc(n.slice(t?2:1),t?16:10)}return Fc(n)||e}var gd={}.hasOwnProperty;function _d(e,t,n){return t&&typeof t==`object`&&(n=t,t=void 0),vd(n)(ud(ld(n).document().write(fd()(e,t,!0))))}function vd(e){let t={transforms:[],canContainEols:[`emphasis`,`fragment`,`heading`,`paragraph`,`strong`],enter:{autolink:a(we),autolinkProtocol:T,autolinkEmail:T,atxHeading:a(be),blockQuote:a(he),characterEscape:T,characterReference:T,codeFenced:a(ge),codeFencedFenceInfo:o,codeFencedFenceMeta:o,codeIndented:a(ge,o),codeText:a(_e,o),codeTextData:T,data:T,codeFlowValue:T,definition:a(ve),definitionDestinationString:o,definitionLabelString:o,definitionTitleString:o,emphasis:a(ye),hardBreakEscape:a(xe),hardBreakTrailing:a(xe),htmlFlow:a(Se,o),htmlFlowData:T,htmlText:a(Se,o),htmlTextData:T,image:a(Ce),label:o,link:a(we),listItem:a(Ee),listItemValue:f,listOrdered:a(Te,d),listUnordered:a(Te),paragraph:a(De),reference:ce,referenceString:o,resourceDestinationString:o,resourceTitleString:o,setextHeading:a(be),strong:a(Oe),thematicBreak:a(Ae)},exit:{atxHeading:c(),atxHeadingSequence:x,autolink:c(),autolinkEmail:me,autolinkProtocol:pe,blockQuote:c(),characterEscapeValue:E,characterReferenceMarkerHexadecimal:ue,characterReferenceMarkerNumeric:ue,characterReferenceValue:de,characterReference:fe,codeFenced:c(g),codeFencedFence:h,codeFencedFenceInfo:p,codeFencedFenceMeta:m,codeFlowValue:E,codeIndented:c(_),codeText:c(ne),codeTextData:E,data:E,definition:c(),definitionDestinationString:b,definitionLabelString:v,definitionTitleString:y,emphasis:c(),hardBreakEscape:c(D),hardBreakTrailing:c(D),htmlFlow:c(O),htmlFlowData:E,htmlText:c(te),htmlTextData:E,image:c(ie),label:oe,labelText:ae,lineEnding:ee,link:c(re),listItem:c(),listOrdered:c(),listUnordered:c(),paragraph:c(),referenceString:le,resourceDestinationString:k,resourceTitleString:A,resource:se,setextHeading:c(w),setextHeadingLineSequence:C,setextHeadingText:S,strong:c(),thematicBreak:c()}};bd(t,(e||{}).mdastExtensions||[]);let n={};return r;function r(e){let r={type:`root`,children:[]},a={stack:[r],tokenStack:[],config:t,enter:s,exit:l,buffer:o,resume:u,data:n},c=[],d=-1;for(;++d<e.length;)(e[d][1].type===`listOrdered`||e[d][1].type===`listUnordered`)&&(e[d][0]===`enter`?c.push(d):d=i(e,c.pop(),d));for(d=-1;++d<e.length;){let n=t[e[d][0]];gd.call(n,e[d][1].type)&&n[e[d][1].type].call(Object.assign({sliceSerialize:e[d][2].sliceSerialize},a),e[d][1])}if(a.tokenStack.length>0){let e=a.tokenStack[a.tokenStack.length-1];(e[1]||Sd).call(a,void 0,e[0])}for(r.position={start:yd(e.length>0?e[0][1].start:{line:1,column:1,offset:0}),end:yd(e.length>0?e[e.length-2][1].end:{line:1,column:1,offset:0})},d=-1;++d<t.transforms.length;)r=t.transforms[d](r)||r;return r}function i(e,t,n){let r=t-1,i=-1,a=!1,o,s,c,l;for(;++r<=n;){let t=e[r];switch(t[1].type){case`listUnordered`:case`listOrdered`:case`blockQuote`:t[0]===`enter`?i++:i--,l=void 0;break;case`lineEndingBlank`:t[0]===`enter`&&(o&&!l&&!i&&!c&&(c=r),l=void 0);break;case`linePrefix`:case`listItemValue`:case`listItemMarker`:case`listItemPrefix`:case`listItemPrefixWhitespace`:break;default:l=void 0}if(!i&&t[0]===`enter`&&t[1].type===`listItemPrefix`||i===-1&&t[0]===`exit`&&(t[1].type===`listUnordered`||t[1].type===`listOrdered`)){if(o){let i=r;for(s=void 0;i--;){let t=e[i];if(t[1].type===`lineEnding`||t[1].type===`lineEndingBlank`){if(t[0]===`exit`)continue;s&&(e[s][1].type=`lineEndingBlank`,a=!0),t[1].type=`lineEnding`,s=i}else if(t[1].type!==`linePrefix`&&t[1].type!==`blockQuotePrefix`&&t[1].type!==`blockQuotePrefixWhitespace`&&t[1].type!==`blockQuoteMarker`&&t[1].type!==`listItemIndent`)break}c&&(!s||c<s)&&(o._spread=!0),o.end=Object.assign({},s?e[s][1].start:t[1].end),e.splice(s||r,0,[`exit`,o,t[2]]),r++,n++}if(t[1].type===`listItemPrefix`){let i={type:`listItem`,_spread:!1,start:Object.assign({},t[1].start),end:void 0};o=i,e.splice(r,0,[`enter`,i,t[2]]),r++,n++,c=void 0,l=!0}}}return e[t][1]._spread=a,n}function a(e,t){return n;function n(n){s.call(this,e(n),n),t&&t.call(this,n)}}function o(){this.stack.push({type:`fragment`,children:[]})}function s(e,t,n){this.stack[this.stack.length-1].children.push(e),this.stack.push(e),this.tokenStack.push([t,n||void 0]),e.position={start:yd(t.start),end:void 0}}function c(e){return t;function t(t){e&&e.call(this,t),l.call(this,t)}}function l(e,t){let n=this.stack.pop(),r=this.tokenStack.pop();if(r)r[0].type!==e.type&&(t?t.call(this,e,r[0]):(r[1]||Sd).call(this,e,r[0]));else throw Error("Cannot close `"+e.type+"` ("+Ys({start:e.start,end:e.end})+`): it’s not open`);n.position.end=yd(e.end)}function u(){return Ac(this.stack.pop())}function d(){this.data.expectingFirstListItemValue=!0}function f(e){if(this.data.expectingFirstListItemValue){let t=this.stack[this.stack.length-2];t.start=Number.parseInt(this.sliceSerialize(e),10),this.data.expectingFirstListItemValue=void 0}}function p(){let e=this.resume(),t=this.stack[this.stack.length-1];t.lang=e}function m(){let e=this.resume(),t=this.stack[this.stack.length-1];t.meta=e}function h(){this.data.flowCodeInside||(this.buffer(),this.data.flowCodeInside=!0)}function g(){let e=this.resume(),t=this.stack[this.stack.length-1];t.value=e.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g,``),this.data.flowCodeInside=void 0}function _(){let e=this.resume(),t=this.stack[this.stack.length-1];t.value=e.replace(/(\r?\n|\r)$/g,``)}function v(e){let t=this.resume(),n=this.stack[this.stack.length-1];n.label=t,n.identifier=Uc(this.sliceSerialize(e)).toLowerCase()}function y(){let e=this.resume(),t=this.stack[this.stack.length-1];t.title=e}function b(){let e=this.resume(),t=this.stack[this.stack.length-1];t.url=e}function x(e){let t=this.stack[this.stack.length-1];t.depth||=this.sliceSerialize(e).length}function S(){this.data.setextHeadingSlurpLineEnding=!0}function C(e){let t=this.stack[this.stack.length-1];t.depth=this.sliceSerialize(e).codePointAt(0)===61?1:2}function w(){this.data.setextHeadingSlurpLineEnding=void 0}function T(e){let t=this.stack[this.stack.length-1].children,n=t[t.length-1];(!n||n.type!==`text`)&&(n=ke(),n.position={start:yd(e.start),end:void 0},t.push(n)),this.stack.push(n)}function E(e){let t=this.stack.pop();t.value+=this.sliceSerialize(e),t.position.end=yd(e.end)}function ee(e){let n=this.stack[this.stack.length-1];if(this.data.atHardBreak){let t=n.children[n.children.length-1];t.position.end=yd(e.end),this.data.atHardBreak=void 0;return}!this.data.setextHeadingSlurpLineEnding&&t.canContainEols.includes(n.type)&&(T.call(this,e),E.call(this,e))}function D(){this.data.atHardBreak=!0}function O(){let e=this.resume(),t=this.stack[this.stack.length-1];t.value=e}function te(){let e=this.resume(),t=this.stack[this.stack.length-1];t.value=e}function ne(){let e=this.resume(),t=this.stack[this.stack.length-1];t.value=e}function re(){let e=this.stack[this.stack.length-1];if(this.data.inReference){let t=this.data.referenceType||`shortcut`;e.type+=`Reference`,e.referenceType=t,delete e.url,delete e.title}else delete e.identifier,delete e.label;this.data.referenceType=void 0}function ie(){let e=this.stack[this.stack.length-1];if(this.data.inReference){let t=this.data.referenceType||`shortcut`;e.type+=`Reference`,e.referenceType=t,delete e.url,delete e.title}else delete e.identifier,delete e.label;this.data.referenceType=void 0}function ae(e){let t=this.sliceSerialize(e),n=this.stack[this.stack.length-2];n.label=md(t),n.identifier=Uc(t).toLowerCase()}function oe(){let e=this.stack[this.stack.length-1],t=this.resume(),n=this.stack[this.stack.length-1];this.data.inReference=!0,n.type===`link`?n.children=e.children:n.alt=t}function k(){let e=this.resume(),t=this.stack[this.stack.length-1];t.url=e}function A(){let e=this.resume(),t=this.stack[this.stack.length-1];t.title=e}function se(){this.data.inReference=void 0}function ce(){this.data.referenceType=`collapsed`}function le(e){let t=this.resume(),n=this.stack[this.stack.length-1];n.label=t,n.identifier=Uc(this.sliceSerialize(e)).toLowerCase(),this.data.referenceType=`full`}function ue(e){this.data.characterReferenceType=e.type}function de(e){let t=this.sliceSerialize(e),n=this.data.characterReferenceType,r;n?(r=Hc(t,n===`characterReferenceMarkerNumeric`?10:16),this.data.characterReferenceType=void 0):r=Fc(t);let i=this.stack[this.stack.length-1];i.value+=r}function fe(e){let t=this.stack.pop();t.position.end=yd(e.end)}function pe(e){E.call(this,e);let t=this.stack[this.stack.length-1];t.url=this.sliceSerialize(e)}function me(e){E.call(this,e);let t=this.stack[this.stack.length-1];t.url=`mailto:`+this.sliceSerialize(e)}function he(){return{type:`blockquote`,children:[]}}function ge(){return{type:`code`,lang:null,meta:null,value:``}}function _e(){return{type:`inlineCode`,value:``}}function ve(){return{type:`definition`,identifier:``,label:null,title:null,url:``}}function ye(){return{type:`emphasis`,children:[]}}function be(){return{type:`heading`,depth:0,children:[]}}function xe(){return{type:`break`}}function Se(){return{type:`html`,value:``}}function Ce(){return{type:`image`,title:null,url:``,alt:null}}function we(){return{type:`link`,title:null,url:``,children:[]}}function Te(e){return{type:`list`,ordered:e.type===`listOrdered`,start:null,spread:e._spread,children:[]}}function Ee(e){return{type:`listItem`,spread:e._spread,checked:null,children:[]}}function De(){return{type:`paragraph`,children:[]}}function Oe(){return{type:`strong`,children:[]}}function ke(){return{type:`text`,value:``}}function Ae(){return{type:`thematicBreak`}}}function yd(e){return{line:e.line,column:e.column,offset:e.offset}}function bd(e,t){let n=-1;for(;++n<t.length;){let r=t[n];Array.isArray(r)?bd(e,r):xd(e,r)}}function xd(e,t){let n;for(n in t)if(gd.call(t,n))switch(n){case`canContainEols`:{let r=t[n];r&&e[n].push(...r);break}case`transforms`:{let r=t[n];r&&e[n].push(...r);break}case`enter`:case`exit`:{let r=t[n];r&&Object.assign(e[n],r);break}}}function Sd(e,t){throw Error(e?"Cannot close `"+e.type+"` ("+Ys({start:e.start,end:e.end})+"): a different token (`"+t.type+"`, "+Ys({start:t.start,end:t.end})+`) is open`:"Cannot close document, a token (`"+t.type+"`, "+Ys({start:t.start,end:t.end})+`) is still open`)}function Cd(e){let t=this;t.parser=n;function n(n){return _d(n,{...t.data(`settings`),...e,extensions:t.data(`micromarkExtensions`)||[],mdastExtensions:t.data(`fromMarkdownExtensions`)||[]})}}function wd(e,t){let n={type:`element`,tagName:`blockquote`,properties:{},children:e.wrap(e.all(t),!0)};return e.patch(t,n),e.applyData(t,n)}function Td(e,t){let n={type:`element`,tagName:`br`,properties:{},children:[]};return e.patch(t,n),[e.applyData(t,n),{type:`text`,value:`
`}]}function Ed(e,t){let n=t.value?t.value+`
`:``,r={},i=t.lang?t.lang.split(/\s+/):[];i.length>0&&(r.className=[`language-`+i[0]]);let a={type:`element`,tagName:`code`,properties:r,children:[{type:`text`,value:n}]};return t.meta&&(a.data={meta:t.meta}),e.patch(t,a),a=e.applyData(t,a),a={type:`element`,tagName:`pre`,properties:{},children:[a]},e.patch(t,a),a}function Dd(e,t){let n={type:`element`,tagName:`del`,properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function W(e,t){let n={type:`element`,tagName:`em`,properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function Od(e,t){let n=typeof e.options.clobberPrefix==`string`?e.options.clobberPrefix:`user-content-`,r=String(t.identifier).toUpperCase(),i=el(r.toLowerCase()),a=e.footnoteOrder.indexOf(r),o,s=e.footnoteCounts.get(r);s===void 0?(s=0,e.footnoteOrder.push(r),o=e.footnoteOrder.length):o=a+1,s+=1,e.footnoteCounts.set(r,s);let c={type:`element`,tagName:`a`,properties:{href:`#`+n+`fn-`+i,id:n+`fnref-`+i+(s>1?`-`+s:``),dataFootnoteRef:!0,ariaDescribedBy:[`footnote-label`]},children:[{type:`text`,value:String(o)}]};e.patch(t,c);let l={type:`element`,tagName:`sup`,properties:{},children:[c]};return e.patch(t,l),e.applyData(t,l)}function kd(e,t){let n={type:`element`,tagName:`h`+t.depth,properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function Ad(e,t){if(e.options.allowDangerousHtml){let n={type:`raw`,value:t.value};return e.patch(t,n),e.applyData(t,n)}}function jd(e,t){let n=t.referenceType,r=`]`;if(n===`collapsed`?r+=`[]`:n===`full`&&(r+=`[`+(t.label||t.identifier)+`]`),t.type===`imageReference`)return[{type:`text`,value:`![`+t.alt+r}];let i=e.all(t),a=i[0];a&&a.type===`text`?a.value=`[`+a.value:i.unshift({type:`text`,value:`[`});let o=i[i.length-1];return o&&o.type===`text`?o.value+=r:i.push({type:`text`,value:r}),i}function Md(e,t){let n=String(t.identifier).toUpperCase(),r=e.definitionById.get(n);if(!r)return jd(e,t);let i={src:el(r.url||``),alt:t.alt};r.title!==null&&r.title!==void 0&&(i.title=r.title);let a={type:`element`,tagName:`img`,properties:i,children:[]};return e.patch(t,a),e.applyData(t,a)}function Nd(e,t){let n={src:el(t.url)};t.alt!==null&&t.alt!==void 0&&(n.alt=t.alt),t.title!==null&&t.title!==void 0&&(n.title=t.title);let r={type:`element`,tagName:`img`,properties:n,children:[]};return e.patch(t,r),e.applyData(t,r)}function Pd(e,t){let n={type:`text`,value:t.value.replace(/\r?\n|\r/g,` `)};e.patch(t,n);let r={type:`element`,tagName:`code`,properties:{},children:[n]};return e.patch(t,r),e.applyData(t,r)}function Fd(e,t){let n=String(t.identifier).toUpperCase(),r=e.definitionById.get(n);if(!r)return jd(e,t);let i={href:el(r.url||``)};r.title!==null&&r.title!==void 0&&(i.title=r.title);let a={type:`element`,tagName:`a`,properties:i,children:e.all(t)};return e.patch(t,a),e.applyData(t,a)}function Id(e,t){let n={href:el(t.url)};t.title!==null&&t.title!==void 0&&(n.title=t.title);let r={type:`element`,tagName:`a`,properties:n,children:e.all(t)};return e.patch(t,r),e.applyData(t,r)}function Ld(e,t,n){let r=e.all(t),i=n?Rd(n):zd(t),a={},o=[];if(typeof t.checked==`boolean`){let e=r[0],n;e&&e.type===`element`&&e.tagName===`p`?n=e:(n={type:`element`,tagName:`p`,properties:{},children:[]},r.unshift(n)),n.children.length>0&&n.children.unshift({type:`text`,value:` `}),n.children.unshift({type:`element`,tagName:`input`,properties:{type:`checkbox`,checked:t.checked,disabled:!0},children:[]}),a.className=[`task-list-item`]}let s=-1;for(;++s<r.length;){let e=r[s];(i||s!==0||e.type!==`element`||e.tagName!==`p`)&&o.push({type:`text`,value:`
`}),e.type===`element`&&e.tagName===`p`&&!i?o.push(...e.children):o.push(e)}let c=r[r.length-1];c&&(i||c.type!==`element`||c.tagName!==`p`)&&o.push({type:`text`,value:`
`});let l={type:`element`,tagName:`li`,properties:a,children:o};return e.patch(t,l),e.applyData(t,l)}function Rd(e){let t=!1;if(e.type===`list`){t=e.spread||!1;let n=e.children,r=-1;for(;!t&&++r<n.length;)t=zd(n[r])}return t}function zd(e){return e.spread??e.children.length>1}function Bd(e,t){let n={},r=e.all(t),i=-1;for(typeof t.start==`number`&&t.start!==1&&(n.start=t.start);++i<r.length;){let e=r[i];if(e.type===`element`&&e.tagName===`li`&&e.properties&&Array.isArray(e.properties.className)&&e.properties.className.includes(`task-list-item`)){n.className=[`contains-task-list`];break}}let a={type:`element`,tagName:t.ordered?`ol`:`ul`,properties:n,children:e.wrap(r,!0)};return e.patch(t,a),e.applyData(t,a)}function Vd(e,t){let n={type:`element`,tagName:`p`,properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function Hd(e,t){let n={type:`root`,children:e.wrap(e.all(t))};return e.patch(t,n),e.applyData(t,n)}function Ud(e,t){let n={type:`element`,tagName:`strong`,properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}function Wd(e,t){let n=e.all(t),r=n.shift(),i=[];if(r){let n={type:`element`,tagName:`thead`,properties:{},children:e.wrap([r],!0)};e.patch(t.children[0],n),i.push(n)}if(n.length>0){let r={type:`element`,tagName:`tbody`,properties:{},children:e.wrap(n,!0)},a=Ks(t.children[1]),o=Gs(t.children[t.children.length-1]);a&&o&&(r.position={start:a,end:o}),i.push(r)}let a={type:`element`,tagName:`table`,properties:{},children:e.wrap(i,!0)};return e.patch(t,a),e.applyData(t,a)}function Gd(e,t,n){let r=n?n.children:void 0,i=(r?r.indexOf(t):1)===0?`th`:`td`,a=n&&n.type===`table`?n.align:void 0,o=a?a.length:t.children.length,s=-1,c=[];for(;++s<o;){let n=t.children[s],r={},o=a?a[s]:void 0;o&&(r.align=o);let l={type:`element`,tagName:i,properties:r,children:[]};n&&(l.children=e.all(n),e.patch(n,l),l=e.applyData(n,l)),c.push(l)}let l={type:`element`,tagName:`tr`,properties:{},children:e.wrap(c,!0)};return e.patch(t,l),e.applyData(t,l)}function Kd(e,t){let n={type:`element`,tagName:`td`,properties:{},children:e.all(t)};return e.patch(t,n),e.applyData(t,n)}var qd=9,Jd=32;function Yd(e){let t=String(e),n=/\r?\n|\r/g,r=n.exec(t),i=0,a=[];for(;r;)a.push(Xd(t.slice(i,r.index),i>0,!0),r[0]),i=r.index+r[0].length,r=n.exec(t);return a.push(Xd(t.slice(i),i>0,!1)),a.join(``)}function Xd(e,t,n){let r=0,i=e.length;if(t){let t=e.codePointAt(r);for(;t===qd||t===Jd;)r++,t=e.codePointAt(r)}if(n){let t=e.codePointAt(i-1);for(;t===qd||t===Jd;)i--,t=e.codePointAt(i-1)}return i>r?e.slice(r,i):``}function Zd(e,t){let n={type:`text`,value:Yd(String(t.value))};return e.patch(t,n),e.applyData(t,n)}function Qd(e,t){let n={type:`element`,tagName:`hr`,properties:{},children:[]};return e.patch(t,n),e.applyData(t,n)}var $d={blockquote:wd,break:Td,code:Ed,delete:Dd,emphasis:W,footnoteReference:Od,heading:kd,html:Ad,imageReference:Md,image:Nd,inlineCode:Pd,linkReference:Fd,link:Id,listItem:Ld,list:Bd,paragraph:Vd,root:Hd,strong:Ud,table:Wd,tableCell:Kd,tableRow:Gd,text:Zd,thematicBreak:Qd,toml:ef,yaml:ef,definition:ef,footnoteDefinition:ef};function ef(){}var tf=typeof self==`object`?self:globalThis,nf=(e,t)=>{switch(e){case`Function`:case`SharedWorker`:case`Worker`:case`eval`:case`setInterval`:case`setTimeout`:throw TypeError(`unable to deserialize `+e)}return new tf[e](t)},rf=(e,t)=>{let n=(t,n)=>(e.set(n,t),t),r=i=>{if(e.has(i))return e.get(i);let[a,o]=t[i];switch(a){case 0:case-1:return n(o,i);case 1:{let e=n([],i);for(let t of o)e.push(r(t));return e}case 2:{let e=n({},i);for(let[t,n]of o)e[r(t)]=r(n);return e}case 3:return n(new Date(o),i);case 4:{let{source:e,flags:t}=o;return n(new RegExp(e,t),i)}case 5:{let e=n(new Map,i);for(let[t,n]of o)e.set(r(t),r(n));return e}case 6:{let e=n(new Set,i);for(let t of o)e.add(r(t));return e}case 7:{let{name:e,message:t}=o;return n(typeof tf[e]==`function`?nf(e,t):Error(t),i)}case 8:return n(BigInt(o),i);case`BigInt`:return n(Object(BigInt(o)),i);case`ArrayBuffer`:return n(new Uint8Array(o).buffer,o);case`DataView`:{let{buffer:e}=new Uint8Array(o);return n(new DataView(e),o)}}return n(nf(a,o),i)};return r},af=e=>rf(new Map,e)(0),of=``,{toString:sf}={},{keys:cf}=Object,lf=e=>{let t=typeof e;if(t!==`object`||!e)return[0,t];let n=sf.call(e).slice(8,-1);switch(n){case`Array`:return[1,of];case`Object`:return[2,of];case`Date`:return[3,of];case`RegExp`:return[4,of];case`Map`:return[5,of];case`Set`:return[6,of];case`DataView`:return[1,n]}return n.includes(`Array`)?[1,n]:e instanceof Error?[7,e.name||`Error`]:[2,n]},uf=([e,t])=>e===0&&(t===`function`||t===`symbol`),df=(e,t,n,r)=>{let i=(e,t)=>{let i=r.push(e)-1;return n.set(t,i),i},a=r=>{if(n.has(r))return n.get(r);let[o,s]=lf(r);switch(o){case 0:{let t=r;switch(s){case`bigint`:o=8,t=r.toString();break;case`function`:case`symbol`:if(e)throw TypeError(`unable to serialize `+s);t=null;break;case`undefined`:return i([-1],r)}return i([o,t],r)}case 1:{if(s){let e=r;return s===`DataView`?e=new Uint8Array(r.buffer):s===`ArrayBuffer`&&(e=new Uint8Array(r)),i([s,[...e]],r)}let e=[],t=i([o,e],r);for(let t of r)e.push(a(t));return t}case 2:{if(s)switch(s){case`BigInt`:return i([s,r.toString()],r);case`Boolean`:case`Number`:case`String`:return i([s,r.valueOf()],r)}if(t&&`toJSON`in r)return a(r.toJSON());let n=[],c=i([o,n],r);for(let t of cf(r))(e||!uf(lf(r[t])))&&n.push([a(t),a(r[t])]);return c}case 3:return i([o,isNaN(r.getTime())?of:r.toISOString()],r);case 4:{let{source:e,flags:t}=r;return i([o,{source:e,flags:t}],r)}case 5:{let t=[],n=i([o,t],r);for(let[n,i]of r)(e||!(uf(lf(n))||uf(lf(i))))&&t.push([a(n),a(i)]);return n}case 6:{let t=[],n=i([o,t],r);for(let n of r)(e||!uf(lf(n)))&&t.push(a(n));return n}}let{message:c}=r;return i([o,{name:s,message:c}],r)};return a},ff=(e,{json:t,lossy:n}={})=>{let r=[];return df(!(t||n),!!t,new Map,r)(e),r},pf=typeof structuredClone==`function`?(e,t)=>t&&(`json`in t||`lossy`in t)?af(ff(e,t)):structuredClone(e):(e,t)=>af(ff(e,t));function mf(e,t){let n=[{type:`text`,value:`↩`}];return t>1&&n.push({type:`element`,tagName:`sup`,properties:{},children:[{type:`text`,value:String(t)}]}),n}function hf(e,t){return`Back to reference `+(e+1)+(t>1?`-`+t:``)}function gf(e){let t=typeof e.options.clobberPrefix==`string`?e.options.clobberPrefix:`user-content-`,n=e.options.footnoteBackContent||mf,r=e.options.footnoteBackLabel||hf,i=e.options.footnoteLabel||`Footnotes`,a=e.options.footnoteLabelTagName||`h2`,o=e.options.footnoteLabelProperties||{className:[`sr-only`]},s=[],c=-1;for(;++c<e.footnoteOrder.length;){let i=e.footnoteById.get(e.footnoteOrder[c]);if(!i)continue;let a=e.all(i),o=String(i.identifier).toUpperCase(),l=el(o.toLowerCase()),u=0,d=[],f=e.footnoteCounts.get(o);for(;f!==void 0&&++u<=f;){d.length>0&&d.push({type:`text`,value:` `});let e=typeof n==`string`?n:n(c,u);typeof e==`string`&&(e={type:`text`,value:e}),d.push({type:`element`,tagName:`a`,properties:{href:`#`+t+`fnref-`+l+(u>1?`-`+u:``),dataFootnoteBackref:``,ariaLabel:typeof r==`string`?r:r(c,u),className:[`data-footnote-backref`]},children:Array.isArray(e)?e:[e]})}let p=a[a.length-1];if(p&&p.type===`element`&&p.tagName===`p`){let e=p.children[p.children.length-1];e&&e.type===`text`?e.value+=` `:p.children.push({type:`text`,value:` `}),p.children.push(...d)}else a.push(...d);let m={type:`element`,tagName:`li`,properties:{id:t+`fn-`+l},children:e.wrap(a,!0)};e.patch(i,m),s.push(m)}if(s.length!==0)return{type:`element`,tagName:`section`,properties:{dataFootnotes:!0,className:[`footnotes`]},children:[{type:`element`,tagName:a,properties:{...pf(o),id:`footnote-label`},children:[{type:`text`,value:i}]},{type:`text`,value:`
`},{type:`element`,tagName:`ol`,properties:{},children:e.wrap(s,!0)},{type:`text`,value:`
`}]}}var _f=(function(e){if(e==null)return Sf;if(typeof e==`function`)return xf(e);if(typeof e==`object`)return Array.isArray(e)?vf(e):yf(e);if(typeof e==`string`)return bf(e);throw Error(`Expected function, string, or object as test`)});function vf(e){let t=[],n=-1;for(;++n<e.length;)t[n]=_f(e[n]);return xf(r);function r(...e){let n=-1;for(;++n<t.length;)if(t[n].apply(this,e))return!0;return!1}}function yf(e){let t=e;return xf(n);function n(n){let r=n,i;for(i in e)if(r[i]!==t[i])return!1;return!0}}function bf(e){return xf(t);function t(t){return t&&t.type===e}}function xf(e){return t;function t(t,n,r){return!!(Cf(t)&&e.call(this,t,typeof n==`number`?n:void 0,r||void 0))}}function Sf(){return!0}function Cf(e){return typeof e==`object`&&!!e&&`type`in e}function wf(e){return e}var Tf=[];function Ef(e,t,n,r){let i;typeof t==`function`&&typeof n!=`function`?(r=n,n=t):i=t;let a=_f(i),o=r?-1:1;s(e,void 0,[])();function s(e,i,c){let l=e&&typeof e==`object`?e:{};if(typeof l.type==`string`){let t=typeof l.tagName==`string`?l.tagName:typeof l.name==`string`?l.name:void 0;Object.defineProperty(u,"name",{value:`node (`+wf(e.type+(t?`<`+t+`>`:``))+`)`})}return u;function u(){let l=Tf,u,d,f;if((!t||a(e,i,c[c.length-1]||void 0))&&(l=Df(n(e,c)),l[0]===!1))return l;if(`children`in e&&e.children){let t=e;if(t.children&&l[0]!==`skip`)for(d=(r?t.children.length:-1)+o,f=c.concat(t);d>-1&&d<t.children.length;){let e=t.children[d];if(u=s(e,d,f)(),u[0]===!1)return u;d=typeof u[1]==`number`?u[1]:d+o}}return l}}}function Df(e){return Array.isArray(e)?e:typeof e==`number`?[!0,e]:e==null?Tf:[e]}function Of(e,t,n,r){let i,a,o;typeof t==`function`&&typeof n!=`function`?(a=void 0,o=t,i=n):(a=t,o=n,i=r),Ef(e,a,s,i);function s(e,t){let n=t[t.length-1],r=n?n.children.indexOf(e):void 0;return o(e,r,n)}}var kf={}.hasOwnProperty,Af={};function jf(e,t){let n=t||Af,r=new Map,i=new Map,a={all:s,applyData:Nf,definitionById:r,footnoteById:i,footnoteCounts:new Map,footnoteOrder:[],handlers:{...$d,...n.handlers},one:o,options:n,patch:Mf,wrap:Ff};return Of(e,function(e){if(e.type===`definition`||e.type===`footnoteDefinition`){let t=e.type===`definition`?r:i,n=String(e.identifier).toUpperCase();t.has(n)||t.set(n,e)}}),a;function o(e,t){let n=e.type,r=a.handlers[n];if(kf.call(a.handlers,n)&&r)return r(a,e,t);if(a.options.passThrough&&a.options.passThrough.includes(n)){if(`children`in e){let{children:t,...n}=e,r=pf(n);return r.children=a.all(e),r}return pf(e)}return(a.options.unknownHandler||Pf)(a,e,t)}function s(e){let t=[];if(`children`in e){let n=e.children,r=-1;for(;++r<n.length;){let i=a.one(n[r],e);if(i){if(r&&n[r-1].type===`break`&&(!Array.isArray(i)&&i.type===`text`&&(i.value=If(i.value)),!Array.isArray(i)&&i.type===`element`)){let e=i.children[0];e&&e.type===`text`&&(e.value=If(e.value))}Array.isArray(i)?t.push(...i):t.push(i)}}}return t}}function Mf(e,t){e.position&&(t.position=Js(e))}function Nf(e,t){let n=t;if(e&&e.data){let t=e.data.hName,r=e.data.hChildren,i=e.data.hProperties;typeof t==`string`&&(n.type===`element`?n.tagName=t:n={type:`element`,tagName:t,properties:{},children:`children`in n?n.children:[n]}),n.type===`element`&&i&&Object.assign(n.properties,pf(i)),`children`in n&&n.children&&r!=null&&(n.children=r)}return n}function Pf(e,t){let n=t.data||{},r=`value`in t&&!(kf.call(n,`hProperties`)||kf.call(n,`hChildren`))?{type:`text`,value:t.value}:{type:`element`,tagName:`div`,properties:{},children:e.all(t)};return e.patch(t,r),e.applyData(t,r)}function Ff(e,t){let n=[],r=-1;for(t&&n.push({type:`text`,value:`
`});++r<e.length;)r&&n.push({type:`text`,value:`
`}),n.push(e[r]);return t&&e.length>0&&n.push({type:`text`,value:`
`}),n}function If(e){let t=0,n=e.charCodeAt(t);for(;n===9||n===32;)t++,n=e.charCodeAt(t);return e.slice(t)}function Lf(e,t){let n=jf(e,t),r=n.one(e,void 0),i=gf(n),a=Array.isArray(r)?{type:`root`,children:r}:r||{type:`root`,children:[]};return i&&(`children`in a,a.children.push({type:`text`,value:`
`},i)),a}function Rf(e,t){return e&&`run`in e?async function(n,r){let i=Lf(n,{file:r,...t});await e.run(i,r)}:function(n,r){return Lf(n,{file:r,...e||t})}}function zf(e){if(e)throw e}var Bf=o(((e,t)=>{var n=Object.prototype.hasOwnProperty,r=Object.prototype.toString,i=Object.defineProperty,a=Object.getOwnPropertyDescriptor,o=function(e){return typeof Array.isArray==`function`?Array.isArray(e):r.call(e)===`[object Array]`},s=function(e){if(!e||r.call(e)!==`[object Object]`)return!1;var t=n.call(e,`constructor`),i=e.constructor&&e.constructor.prototype&&n.call(e.constructor.prototype,`isPrototypeOf`);if(e.constructor&&!t&&!i)return!1;for(var a in e);return a===void 0||n.call(e,a)},c=function(e,t){i&&t.name===`__proto__`?i(e,t.name,{enumerable:!0,configurable:!0,value:t.newValue,writable:!0}):e[t.name]=t.newValue},l=function(e,t){if(t===`__proto__`){if(!n.call(e,t))return;if(a)return a(e,t).value}return e[t]};t.exports=function e(){var t,n,r,i,a,u,d=arguments[0],f=1,p=arguments.length,m=!1;for(typeof d==`boolean`&&(m=d,d=arguments[1]||{},f=2),(d==null||typeof d!=`object`&&typeof d!=`function`)&&(d={});f<p;++f)if(t=arguments[f],t!=null)for(n in t)r=l(d,n),i=l(t,n),d!==i&&(m&&i&&(s(i)||(a=o(i)))?(a?(a=!1,u=r&&o(r)?r:[]):u=r&&s(r)?r:{},c(d,{name:n,newValue:e(m,u,i)})):i!==void 0&&c(d,{name:n,newValue:i}));return d}}));function Vf(e){if(typeof e!=`object`||!e)return!1;let t=Object.getPrototypeOf(e);return(t===null||t===Object.prototype||Object.getPrototypeOf(t)===null)&&!(Symbol.toStringTag in e)&&!(Symbol.iterator in e)}function Hf(){let e=[],t={run:n,use:r};return t;function n(...t){let n=-1,r=t.pop();if(typeof r!=`function`)throw TypeError(`Expected function as last argument, not `+r);i(null,...t);function i(a,...o){let s=e[++n],c=-1;if(a){r(a);return}for(;++c<t.length;)(o[c]===null||o[c]===void 0)&&(o[c]=t[c]);t=o,s?Uf(s,i)(...o):r(null,...o)}}function r(n){if(typeof n!=`function`)throw TypeError("Expected `middelware` to be a function, not "+n);return e.push(n),t}}function Uf(e,t){let n;return r;function r(...t){let r=e.length>t.length,o;r&&t.push(i);try{o=e.apply(this,t)}catch(e){let t=e;if(r&&n)throw t;return i(t)}r||(o&&o.then&&typeof o.then==`function`?o.then(a,i):o instanceof Error?i(o):a(o))}function i(e,...r){n||(n=!0,t(e,...r))}function a(e){i(null,e)}}var Wf={basename:Gf,dirname:Kf,extname:qf,join:Jf,sep:`/`};function Gf(e,t){if(t!==void 0&&typeof t!=`string`)throw TypeError(`"ext" argument must be a string`);Zf(e);let n=0,r=-1,i=e.length,a;if(t===void 0||t.length===0||t.length>e.length){for(;i--;)if(e.codePointAt(i)===47){if(a){n=i+1;break}}else r<0&&(a=!0,r=i+1);return r<0?``:e.slice(n,r)}if(t===e)return``;let o=-1,s=t.length-1;for(;i--;)if(e.codePointAt(i)===47){if(a){n=i+1;break}}else o<0&&(a=!0,o=i+1),s>-1&&(e.codePointAt(i)===t.codePointAt(s--)?s<0&&(r=i):(s=-1,r=o));return n===r?r=o:r<0&&(r=e.length),e.slice(n,r)}function Kf(e){if(Zf(e),e.length===0)return`.`;let t=-1,n=e.length,r;for(;--n;)if(e.codePointAt(n)===47){if(r){t=n;break}}else r||=!0;return t<0?e.codePointAt(0)===47?`/`:`.`:t===1&&e.codePointAt(0)===47?`//`:e.slice(0,t)}function qf(e){Zf(e);let t=e.length,n=-1,r=0,i=-1,a=0,o;for(;t--;){let s=e.codePointAt(t);if(s===47){if(o){r=t+1;break}continue}n<0&&(o=!0,n=t+1),s===46?i<0?i=t:a!==1&&(a=1):i>-1&&(a=-1)}return i<0||n<0||a===0||a===1&&i===n-1&&i===r+1?``:e.slice(i,n)}function Jf(...e){let t=-1,n;for(;++t<e.length;)Zf(e[t]),e[t]&&(n=n===void 0?e[t]:n+`/`+e[t]);return n===void 0?`.`:Yf(n)}function Yf(e){Zf(e);let t=e.codePointAt(0)===47,n=Xf(e,!t);return n.length===0&&!t&&(n=`.`),n.length>0&&e.codePointAt(e.length-1)===47&&(n+=`/`),t?`/`+n:n}function Xf(e,t){let n=``,r=0,i=-1,a=0,o=-1,s,c;for(;++o<=e.length;){if(o<e.length)s=e.codePointAt(o);else if(s===47)break;else s=47;if(s===47){if(i!==o-1&&a!==1){if(i!==o-1&&a===2){if(n.length<2||r!==2||n.codePointAt(n.length-1)!==46||n.codePointAt(n.length-2)!==46){if(n.length>2){if(c=n.lastIndexOf(`/`),c!==n.length-1){c<0?(n=``,r=0):(n=n.slice(0,c),r=n.length-1-n.lastIndexOf(`/`)),i=o,a=0;continue}}else if(n.length>0){n=``,r=0,i=o,a=0;continue}}t&&(n=n.length>0?n+`/..`:`..`,r=2)}else n.length>0?n+=`/`+e.slice(i+1,o):n=e.slice(i+1,o),r=o-i-1}i=o,a=0}else s===46&&a>-1?a++:a=-1}return n}function Zf(e){if(typeof e!=`string`)throw TypeError(`Path must be a string. Received `+JSON.stringify(e))}var Qf={cwd:$f};function $f(){return`/`}function ep(e){return!!(typeof e==`object`&&e&&`href`in e&&e.href&&`protocol`in e&&e.protocol&&e.auth===void 0)}function tp(e){if(typeof e==`string`)e=new URL(e);else if(!ep(e)){let t=TypeError('The "path" argument must be of type string or an instance of URL. Received `'+e+"`");throw t.code=`ERR_INVALID_ARG_TYPE`,t}if(e.protocol!==`file:`){let e=TypeError(`The URL must be of scheme file`);throw e.code=`ERR_INVALID_URL_SCHEME`,e}return np(e)}function np(e){if(e.hostname!==``){let e=TypeError(`File URL host must be "localhost" or empty on darwin`);throw e.code=`ERR_INVALID_FILE_URL_HOST`,e}let t=e.pathname,n=-1;for(;++n<t.length;)if(t.codePointAt(n)===37&&t.codePointAt(n+1)===50){let e=t.codePointAt(n+2);if(e===70||e===102){let e=TypeError(`File URL path must not include encoded / characters`);throw e.code=`ERR_INVALID_FILE_URL_PATH`,e}}return decodeURIComponent(t)}var rp=[`history`,`path`,`basename`,`stem`,`extname`,`dirname`],ip=class{constructor(e){let t;t=e?ep(e)?{path:e}:typeof e==`string`||cp(e)?{value:e}:e:{},this.cwd=`cwd`in t?``:Qf.cwd(),this.data={},this.history=[],this.messages=[],this.value,this.map,this.result,this.stored;let n=-1;for(;++n<rp.length;){let e=rp[n];e in t&&t[e]!==void 0&&t[e]!==null&&(this[e]=e===`history`?[...t[e]]:t[e])}let r;for(r in t)rp.includes(r)||(this[r]=t[r])}get basename(){return typeof this.path==`string`?Wf.basename(this.path):void 0}set basename(e){op(e,`basename`),ap(e,`basename`),this.path=Wf.join(this.dirname||``,e)}get dirname(){return typeof this.path==`string`?Wf.dirname(this.path):void 0}set dirname(e){sp(this.basename,`dirname`),this.path=Wf.join(e||``,this.basename)}get extname(){return typeof this.path==`string`?Wf.extname(this.path):void 0}set extname(e){if(ap(e,`extname`),sp(this.dirname,`extname`),e){if(e.codePointAt(0)!==46)throw Error("`extname` must start with `.`");if(e.includes(`.`,1))throw Error("`extname` cannot contain multiple dots")}this.path=Wf.join(this.dirname,this.stem+(e||``))}get path(){return this.history[this.history.length-1]}set path(e){ep(e)&&(e=tp(e)),op(e,`path`),this.path!==e&&this.history.push(e)}get stem(){return typeof this.path==`string`?Wf.basename(this.path,this.extname):void 0}set stem(e){op(e,`stem`),ap(e,`stem`),this.path=Wf.join(this.dirname||``,e+(this.extname||``))}fail(e,t,n){let r=this.message(e,t,n);throw r.fatal=!0,r}info(e,t,n){let r=this.message(e,t,n);return r.fatal=void 0,r}message(e,t,n){let r=new $s(e,t,n);return this.path&&(r.name=this.path+`:`+r.name,r.file=this.path),r.fatal=!1,this.messages.push(r),r}toString(e){return this.value===void 0?``:typeof this.value==`string`?this.value:new TextDecoder(e||void 0).decode(this.value)}};function ap(e,t){if(e&&e.includes(Wf.sep))throw Error("`"+t+"` cannot be a path: did not expect `"+Wf.sep+"`")}function op(e,t){if(!e)throw Error("`"+t+"` cannot be empty")}function sp(e,t){if(!e)throw Error("Setting `"+t+"` requires `path` to be set too")}function cp(e){return!!(e&&typeof e==`object`&&`byteLength`in e&&`byteOffset`in e)}var lp=(function(e){let t=this.constructor.prototype,n=t[e],r=function(){return n.apply(r,arguments)};return Object.setPrototypeOf(r,t),r}),up=l(Bf(),1),dp={}.hasOwnProperty,fp=new class e extends lp{constructor(){super(`copy`),this.Compiler=void 0,this.Parser=void 0,this.attachers=[],this.compiler=void 0,this.freezeIndex=-1,this.frozen=void 0,this.namespace={},this.parser=void 0,this.transformers=Hf()}copy(){let t=new e,n=-1;for(;++n<this.attachers.length;){let e=this.attachers[n];t.use(...e)}return t.data((0,up.default)(!0,{},this.namespace)),t}data(e,t){return typeof e==`string`?arguments.length===2?(hp(`data`,this.frozen),this.namespace[e]=t,this):dp.call(this.namespace,e)&&this.namespace[e]||void 0:e?(hp(`data`,this.frozen),this.namespace=e,this):this.namespace}freeze(){if(this.frozen)return this;let e=this;for(;++this.freezeIndex<this.attachers.length;){let[t,...n]=this.attachers[this.freezeIndex];if(n[0]===!1)continue;n[0]===!0&&(n[0]=void 0);let r=t.call(e,...n);typeof r==`function`&&this.transformers.use(r)}return this.frozen=!0,this.freezeIndex=1/0,this}parse(e){this.freeze();let t=vp(e),n=this.parser||this.Parser;return pp(`parse`,n),n(String(t),t)}process(e,t){let n=this;return this.freeze(),pp(`process`,this.parser||this.Parser),mp(`process`,this.compiler||this.Compiler),t?r(void 0,t):new Promise(r);function r(r,i){let a=vp(e),o=n.parse(a);n.run(o,a,function(e,t,r){if(e||!t||!r)return s(e);let i=t,a=n.stringify(i,r);bp(a)?r.value=a:r.result=a,s(e,r)});function s(e,n){e||!n?i(e):r?r(n):t(void 0,n)}}}processSync(e){let t=!1,n;return this.freeze(),pp(`processSync`,this.parser||this.Parser),mp(`processSync`,this.compiler||this.Compiler),this.process(e,r),_p(`processSync`,`process`,t),n;function r(e,r){t=!0,zf(e),n=r}}run(e,t,n){gp(e),this.freeze();let r=this.transformers;return!n&&typeof t==`function`&&(n=t,t=void 0),n?i(void 0,n):new Promise(i);function i(i,a){let o=vp(t);r.run(e,o,s);function s(t,r,o){let s=r||e;t?a(t):i?i(s):n(void 0,s,o)}}}runSync(e,t){let n=!1,r;return this.run(e,t,i),_p(`runSync`,`run`,n),r;function i(e,t){zf(e),r=t,n=!0}}stringify(e,t){this.freeze();let n=vp(t),r=this.compiler||this.Compiler;return mp(`stringify`,r),gp(e),r(e,n)}use(e,...t){let n=this.attachers,r=this.namespace;if(hp(`use`,this.frozen),e!=null){if(typeof e==`function`)s(e,t);else if(typeof e==`object`)Array.isArray(e)?o(e):a(e);else throw TypeError("Expected usable value, not `"+e+"`")}return this;function i(e){if(typeof e==`function`)s(e,[]);else if(typeof e==`object`){if(Array.isArray(e)){let[t,...n]=e;s(t,n)}else a(e)}else throw TypeError("Expected usable value, not `"+e+"`")}function a(e){if(!(`plugins`in e)&&!(`settings`in e))throw Error("Expected usable value but received an empty preset, which is probably a mistake: presets typically come with `plugins` and sometimes with `settings`, but this has neither");o(e.plugins),e.settings&&(r.settings=(0,up.default)(!0,r.settings,e.settings))}function o(e){let t=-1;if(e!=null){if(Array.isArray(e))for(;++t<e.length;){let n=e[t];i(n)}else throw TypeError("Expected a list of plugins, not `"+e+"`")}}function s(e,t){let r=-1,i=-1;for(;++r<n.length;)if(n[r][0]===e){i=r;break}if(i===-1)n.push([e,...t]);else if(t.length>0){let[r,...a]=t,o=n[i][1];Vf(o)&&Vf(r)&&(r=(0,up.default)(!0,o,r)),n[i]=[e,r,...a]}}}}().freeze();function pp(e,t){if(typeof t!=`function`)throw TypeError("Cannot `"+e+"` without `parser`")}function mp(e,t){if(typeof t!=`function`)throw TypeError("Cannot `"+e+"` without `compiler`")}function hp(e,t){if(t)throw Error("Cannot call `"+e+"` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`.")}function gp(e){if(!Vf(e)||typeof e.type!=`string`)throw TypeError("Expected node, got `"+e+"`")}function _p(e,t,n){if(!n)throw Error("`"+e+"` finished async. Use `"+t+"` instead")}function vp(e){return yp(e)?e:new ip(e)}function yp(e){return!!(e&&typeof e==`object`&&`message`in e&&`messages`in e)}function bp(e){return typeof e==`string`||xp(e)}function xp(e){return!!(e&&typeof e==`object`&&`byteLength`in e&&`byteOffset`in e)}var Sp=[],Cp={allowDangerousHtml:!0},wp=/^(https?|ircs?|mailto|xmpp)$/i,Tp=[{from:`astPlugins`,id:`remove-buggy-html-in-markdown-parser`},{from:`allowDangerousHtml`,id:`remove-buggy-html-in-markdown-parser`},{from:`allowNode`,id:`replace-allownode-allowedtypes-and-disallowedtypes`,to:`allowElement`},{from:`allowedTypes`,id:`replace-allownode-allowedtypes-and-disallowedtypes`,to:`allowedElements`},{from:`className`,id:`remove-classname`},{from:`disallowedTypes`,id:`replace-allownode-allowedtypes-and-disallowedtypes`,to:`disallowedElements`},{from:`escapeHtml`,id:`remove-buggy-html-in-markdown-parser`},{from:`includeElementIndex`,id:`#remove-includeelementindex`},{from:`includeNodeIndex`,id:`change-includenodeindex-to-includeelementindex`},{from:`linkTarget`,id:`remove-linktarget`},{from:`plugins`,id:`change-plugins-to-remarkplugins`,to:`remarkPlugins`},{from:`rawSourcePos`,id:`#remove-rawsourcepos`},{from:`renderers`,id:`change-renderers-to-components`,to:`components`},{from:`source`,id:`change-source-to-children`,to:`children`},{from:`sourcePos`,id:`#remove-sourcepos`},{from:`transformImageUri`,id:`#add-urltransform`,to:`urlTransform`},{from:`transformLinkUri`,id:`#add-urltransform`,to:`urlTransform`}];function Ep(e){let t=Dp(e),n=Op(e);return kp(t.runSync(t.parse(n),n),e)}function Dp(e){let t=e.rehypePlugins||Sp,n=e.remarkPlugins||Sp,r=e.remarkRehypeOptions?{...e.remarkRehypeOptions,...Cp}:Cp;return fp().use(Cd).use(n).use(Rf,r).use(t)}function Op(e){let t=e.children||``,n=new ip;return typeof t==`string`?n.value=t:``+t,n}function kp(e,t){let n=t.allowedElements,r=t.allowElement,i=t.components,a=t.disallowedElements,o=t.skipHtml,s=t.unwrapDisallowed,c=t.urlTransform||Ap;for(let e of Tp)Object.hasOwn(t,e.from)&&``+e.from+(e.to?"use `"+e.to+"` instead":`remove it`)+e.id;return Of(e,l),oc(e,{Fragment:P.Fragment,components:i,ignoreInvalidStyle:!0,jsx:P.jsx,jsxs:P.jsxs,passKeys:!0,passNode:!0});function l(e,t,i){if(e.type===`raw`&&i&&typeof t==`number`)return o?i.children.splice(t,1):i.children[t]={type:`text`,value:e.value},t;if(e.type===`element`){let t;for(t in Oc)if(Object.hasOwn(Oc,t)&&Object.hasOwn(e.properties,t)){let n=e.properties[t],r=Oc[t];(r===null||r.includes(e.tagName))&&(e.properties[t]=c(String(n||``),t,e))}}if(e.type===`element`){let o=n?!n.includes(e.tagName):a?a.includes(e.tagName):!1;if(!o&&r&&typeof t==`number`&&(o=!r(e,t,i)),o&&i&&typeof t==`number`)return s&&e.children?i.children.splice(t,1,...e.children):i.children.splice(t,1),t}}}function Ap(e){let t=e.indexOf(`:`),n=e.indexOf(`?`),r=e.indexOf(`#`),i=e.indexOf(`/`);return t===-1||i!==-1&&t>i||n!==-1&&t>n||r!==-1&&t>r||wp.test(e.slice(0,t))?e:``}function jp(e,t){let n=String(e);if(typeof t!=`string`)throw TypeError(`Expected character`);let r=0,i=n.indexOf(t);for(;i!==-1;)r++,i=n.indexOf(t,i+t.length);return r}function Mp(e){if(typeof e!=`string`)throw TypeError(`Expected a string`);return e.replace(/[|\\{}()[\]^$+*?.]/g,`\\$&`).replace(/-/g,`\\x2d`)}function Np(e,t,n){let r=_f((n||{}).ignore||[]),i=Pp(t),a=-1;for(;++a<i.length;)Ef(e,`text`,o);function o(e,t){let n=-1,i;for(;++n<t.length;){let e=t[n],a=i?i.children:void 0;if(r(e,a?a.indexOf(e):void 0,i))return;i=e}if(i)return s(e,t)}function s(e,t){let n=t[t.length-1],r=i[a][0],o=i[a][1],s=0,c=n.children.indexOf(e),l=!1,u=[];r.lastIndex=0;let d=r.exec(e.value);for(;d;){let n=d.index,i={index:d.index,input:d.input,stack:[...t,e]},a=o(...d,i);if(typeof a==`string`&&(a=a.length>0?{type:`text`,value:a}:void 0),a===!1?r.lastIndex=n+1:(s!==n&&u.push({type:`text`,value:e.value.slice(s,n)}),Array.isArray(a)?u.push(...a):a&&u.push(a),s=n+d[0].length,l=!0),!r.global)break;d=r.exec(e.value)}return l?(s<e.value.length&&u.push({type:`text`,value:e.value.slice(s)}),n.children.splice(c,1,...u)):u=[e],c+u.length}}function Pp(e){let t=[];if(!Array.isArray(e))throw TypeError(`Expected find and replace tuple or list of tuples`);let n=!e[0]||Array.isArray(e[0])?e:[e],r=-1;for(;++r<n.length;){let e=n[r];t.push([Fp(e[0]),Ip(e[1])])}return t}function Fp(e){return typeof e==`string`?new RegExp(Mp(e),`g`):e}function Ip(e){return typeof e==`function`?e:function(){return e}}var Lp=`phrasing`,Rp=[`autolink`,`link`,`image`,`label`];function zp(){return{transforms:[qp],enter:{literalAutolink:Vp,literalAutolinkEmail:Hp,literalAutolinkHttp:Hp,literalAutolinkWww:Hp},exit:{literalAutolink:Kp,literalAutolinkEmail:Gp,literalAutolinkHttp:Up,literalAutolinkWww:Wp}}}function Bp(){return{unsafe:[{character:`@`,before:`[+\\-.\\w]`,after:`[\\-.\\w]`,inConstruct:Lp,notInConstruct:Rp},{character:`.`,before:`[Ww]`,after:`[\\-.\\w]`,inConstruct:Lp,notInConstruct:Rp},{character:`:`,before:`[ps]`,after:`\\/`,inConstruct:Lp,notInConstruct:Rp}]}}function Vp(e){this.enter({type:`link`,title:null,url:``,children:[]},e)}function Hp(e){this.config.enter.autolinkProtocol.call(this,e)}function Up(e){this.config.exit.autolinkProtocol.call(this,e)}function Wp(e){this.config.exit.data.call(this,e);let t=this.stack[this.stack.length-1];t.type,t.url=`http://`+this.sliceSerialize(e)}function Gp(e){this.config.exit.autolinkEmail.call(this,e)}function Kp(e){this.exit(e)}function qp(e){Np(e,[[/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi,Jp],[/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu,Yp]],{ignore:[`link`,`linkReference`]})}function Jp(e,t,n,r,i){let a=``;if(!Qp(i)||(/^w/i.test(t)&&(n=t+n,t=``,a=`http://`),!Xp(n)))return!1;let o=Zp(n+r);if(!o[0])return!1;let s={type:`link`,title:null,url:a+t+o[0],children:[{type:`text`,value:t+o[0]}]};return o[1]?[s,{type:`text`,value:o[1]}]:s}function Yp(e,t,n,r){return!Qp(r,!0)||/[-\d_]$/.test(n)?!1:{type:`link`,title:null,url:`mailto:`+t+`@`+n,children:[{type:`text`,value:t+`@`+n}]}}function Xp(e){let t=e.split(`.`);return!(t.length<2||t[t.length-1]&&(/_/.test(t[t.length-1])||!/[a-zA-Z\d]/.test(t[t.length-1]))||t[t.length-2]&&(/_/.test(t[t.length-2])||!/[a-zA-Z\d]/.test(t[t.length-2])))}function Zp(e){let t=/[!"&'),.:;<>?\]}]+$/.exec(e);if(!t)return[e,void 0];e=e.slice(0,t.index);let n=t[0],r=n.indexOf(`)`),i=jp(e,`(`),a=jp(e,`)`);for(;r!==-1&&i>a;)e+=n.slice(0,r+1),n=n.slice(r+1),r=n.indexOf(`)`),a++;return[e,n]}function Qp(e,t){let n=e.input.charCodeAt(e.index-1);return(e.index===0||Qc(n)||Zc(n))&&(!t||n!==47)}cm.peek=sm;function $p(){this.buffer()}function em(e){this.enter({type:`footnoteReference`,identifier:``,label:``},e)}function tm(){this.buffer()}function nm(e){this.enter({type:`footnoteDefinition`,identifier:``,label:``,children:[]},e)}function rm(e){let t=this.resume(),n=this.stack[this.stack.length-1];n.type,n.identifier=Uc(this.sliceSerialize(e)).toLowerCase(),n.label=t}function im(e){this.exit(e)}function am(e){let t=this.resume(),n=this.stack[this.stack.length-1];n.type,n.identifier=Uc(this.sliceSerialize(e)).toLowerCase(),n.label=t}function om(e){this.exit(e)}function sm(){return`[`}function cm(e,t,n,r){let i=n.createTracker(r),a=i.move(`[^`),o=n.enter(`footnoteReference`),s=n.enter(`reference`);return a+=i.move(n.safe(n.associationId(e),{after:`]`,before:a})),s(),o(),a+=i.move(`]`),a}function lm(){return{enter:{gfmFootnoteCallString:$p,gfmFootnoteCall:em,gfmFootnoteDefinitionLabelString:tm,gfmFootnoteDefinition:nm},exit:{gfmFootnoteCallString:rm,gfmFootnoteCall:im,gfmFootnoteDefinitionLabelString:am,gfmFootnoteDefinition:om}}}function um(e){let t=!1;return e&&e.firstLineBlank&&(t=!0),{handlers:{footnoteDefinition:n,footnoteReference:cm},unsafe:[{character:`[`,inConstruct:[`label`,`phrasing`,`reference`]}]};function n(e,n,r,i){let a=r.createTracker(i),o=a.move(`[^`),s=r.enter(`footnoteDefinition`),c=r.enter(`label`);return o+=a.move(r.safe(r.associationId(e),{before:o,after:`]`})),c(),o+=a.move(`]:`),e.children&&e.children.length>0&&(a.shift(4),o+=a.move((t?`
`:` `)+r.indentLines(r.containerFlow(e,a.current()),t?fm:dm))),s(),o}}function dm(e,t,n){return t===0?e:fm(e,t,n)}function fm(e,t,n){return(n?``:`    `)+e}var pm=[`autolink`,`destinationLiteral`,`destinationRaw`,`reference`,`titleQuote`,`titleApostrophe`];vm.peek=ym;function mm(){return{canContainEols:[`delete`],enter:{strikethrough:gm},exit:{strikethrough:_m}}}function hm(){return{unsafe:[{character:`~`,inConstruct:`phrasing`,notInConstruct:pm}],handlers:{delete:vm}}}function gm(e){this.enter({type:`delete`,children:[]},e)}function _m(e){this.exit(e)}function vm(e,t,n,r){let i=n.createTracker(r),a=n.enter(`strikethrough`),o=i.move(`~~`);return o+=n.containerPhrasing(e,{...i.current(),before:o,after:`~`}),o+=i.move(`~~`),a(),o}function ym(){return`~`}function bm(e){return e.length}function xm(e,t){let n=t||{},r=(n.align||[]).concat(),i=n.stringLength||bm,a=[],o=[],s=[],c=[],l=0,u=-1;for(;++u<e.length;){let t=[],r=[],a=-1;for(e[u].length>l&&(l=e[u].length);++a<e[u].length;){let o=Sm(e[u][a]);if(n.alignDelimiters!==!1){let e=i(o);r[a]=e,(c[a]===void 0||e>c[a])&&(c[a]=e)}t.push(o)}o[u]=t,s[u]=r}let d=-1;if(typeof r==`object`&&`length`in r)for(;++d<l;)a[d]=Cm(r[d]);else{let e=Cm(r);for(;++d<l;)a[d]=e}d=-1;let f=[],p=[];for(;++d<l;){let e=a[d],t=``,r=``;e===99?(t=`:`,r=`:`):e===108?t=`:`:e===114&&(r=`:`);let i=n.alignDelimiters===!1?1:Math.max(1,c[d]-t.length-r.length),o=t+`-`.repeat(i)+r;n.alignDelimiters!==!1&&(i=t.length+i+r.length,i>c[d]&&(c[d]=i),p[d]=i),f[d]=o}o.splice(1,0,f),s.splice(1,0,p),u=-1;let m=[];for(;++u<o.length;){let e=o[u],t=s[u];d=-1;let r=[];for(;++d<l;){let i=e[d]||``,o=``,s=``;if(n.alignDelimiters!==!1){let e=c[d]-(t[d]||0),n=a[d];n===114?o=` `.repeat(e):n===99?e%2?(o=` `.repeat(e/2+.5),s=` `.repeat(e/2-.5)):(o=` `.repeat(e/2),s=o):s=` `.repeat(e)}n.delimiterStart!==!1&&!d&&r.push(`|`),n.padding!==!1&&(n.alignDelimiters!==!1||i!==``)&&(n.delimiterStart!==!1||d)&&r.push(` `),n.alignDelimiters!==!1&&r.push(o),r.push(i),n.alignDelimiters!==!1&&r.push(s),n.padding!==!1&&r.push(` `),(n.delimiterEnd!==!1||d!==l-1)&&r.push(`|`)}m.push(n.delimiterEnd===!1?r.join(``).replace(/ +$/,``):r.join(``))}return m.join(`
`)}function Sm(e){return e==null?``:String(e)}function Cm(e){let t=typeof e==`string`?e.codePointAt(0):0;return t===67||t===99?99:t===76||t===108?108:t===82||t===114?114:0}var wm={}.hasOwnProperty;function Tm(e,t){let n=t||{};function r(t,...n){let i=r.invalid,a=r.handlers;if(t&&wm.call(t,e)){let n=String(t[e]);i=wm.call(a,n)?a[n]:r.unknown}if(i)return i.call(this,t,...n)}return r.handlers=n.handlers||{},r.invalid=n.invalid,r.unknown=n.unknown,r}function Em(e,t,n,r){let i=n.enter(`blockquote`),a=n.createTracker(r);a.move(`> `),a.shift(2);let o=n.indentLines(n.containerFlow(e,a.current()),Dm);return i(),o}function Dm(e,t,n){return`>`+(n?``:` `)+e}function Om(e,t){return km(e,t.inConstruct,!0)&&!km(e,t.notInConstruct,!1)}function km(e,t,n){if(typeof t==`string`&&(t=[t]),!t||t.length===0)return n;let r=-1;for(;++r<t.length;)if(e.includes(t[r]))return!0;return!1}function Am(e,t,n,r){let i=-1;for(;++i<n.unsafe.length;)if(n.unsafe[i].character===`
`&&Om(n.stack,n.unsafe[i]))return/[ \t]/.test(r.before)?``:` `;return`\\
`}function jm(e,t){let n=String(e),r=n.indexOf(t),i=r,a=0,o=0;if(typeof t!=`string`)throw TypeError(`Expected substring`);for(;r!==-1;)r===i?++a>o&&(o=a):a=1,i=r+t.length,r=n.indexOf(t,i);return o}function Mm(e,t){return!!(t.options.fences===!1&&e.value&&!e.lang&&/[^ \r\n]/.test(e.value)&&!/^[\t ]*(?:[\r\n]|$)|(?:^|[\r\n])[\t ]*$/.test(e.value))}function Nm(e){let t=e.options.fence||"`";if(t!=="`"&&t!==`~`)throw Error("Cannot serialize code with `"+t+"` for `options.fence`, expected `` ` `` or `~`");return t}function Pm(e,t,n,r){let i=Nm(n),a=e.value||``,o=i==="`"?`GraveAccent`:`Tilde`;if(Mm(e,n)){let e=n.enter(`codeIndented`),t=n.indentLines(a,Fm);return e(),t}let s=n.createTracker(r),c=i.repeat(Math.max(jm(a,i)+1,3)),l=n.enter(`codeFenced`),u=s.move(c);if(e.lang){let t=n.enter(`codeFencedLang${o}`);u+=s.move(n.safe(e.lang,{before:u,after:` `,encode:["`"],...s.current()})),t()}if(e.lang&&e.meta){let t=n.enter(`codeFencedMeta${o}`);u+=s.move(` `),u+=s.move(n.safe(e.meta,{before:u,after:`
`,encode:["`"],...s.current()})),t()}return u+=s.move(`
`),a&&(u+=s.move(a+`
`)),u+=s.move(c),l(),u}function Fm(e,t,n){return(n?``:`    `)+e}function Im(e){let t=e.options.quote||`"`;if(t!==`"`&&t!==`'`)throw Error("Cannot serialize title with `"+t+"` for `options.quote`, expected `\"`, or `'`");return t}function Lm(e,t,n,r){let i=Im(n),a=i===`"`?`Quote`:`Apostrophe`,o=n.enter(`definition`),s=n.enter(`label`),c=n.createTracker(r),l=c.move(`[`);return l+=c.move(n.safe(n.associationId(e),{before:l,after:`]`,...c.current()})),l+=c.move(`]: `),s(),!e.url||/[\0- \u007F]/.test(e.url)?(s=n.enter(`destinationLiteral`),l+=c.move(`<`),l+=c.move(n.safe(e.url,{before:l,after:`>`,...c.current()})),l+=c.move(`>`)):(s=n.enter(`destinationRaw`),l+=c.move(n.safe(e.url,{before:l,after:e.title?` `:`
`,...c.current()}))),s(),e.title&&(s=n.enter(`title${a}`),l+=c.move(` `+i),l+=c.move(n.safe(e.title,{before:l,after:i,...c.current()})),l+=c.move(i),s()),o(),l}function Rm(e){let t=e.options.emphasis||`*`;if(t!==`*`&&t!==`_`)throw Error("Cannot serialize emphasis with `"+t+"` for `options.emphasis`, expected `*`, or `_`");return t}function zm(e){return`&#x`+e.toString(16).toUpperCase()+`;`}function Bm(e,t,n){let r=sl(e),i=sl(t);return r===void 0?i===void 0?n===`_`?{inside:!0,outside:!0}:{inside:!1,outside:!1}:i===1?{inside:!0,outside:!0}:{inside:!1,outside:!0}:r===1?i===void 0?{inside:!1,outside:!1}:i===1?{inside:!0,outside:!0}:{inside:!1,outside:!1}:i===void 0?{inside:!1,outside:!1}:i===1?{inside:!0,outside:!1}:{inside:!1,outside:!1}}Vm.peek=Hm;function Vm(e,t,n,r){let i=Rm(n),a=n.enter(`emphasis`),o=n.createTracker(r),s=o.move(i),c=o.move(n.containerPhrasing(e,{after:i,before:s,...o.current()})),l=c.charCodeAt(0),u=Bm(r.before.charCodeAt(r.before.length-1),l,i);u.inside&&(c=zm(l)+c.slice(1));let d=c.charCodeAt(c.length-1),f=Bm(r.after.charCodeAt(0),d,i);f.inside&&(c=c.slice(0,-1)+zm(d));let p=o.move(i);return a(),n.attentionEncodeSurroundingInfo={after:f.outside,before:u.outside},s+c+p}function Hm(e,t,n){return n.options.emphasis||`*`}function Um(e,t){let n=!1;return Of(e,function(e){if(`value`in e&&/\r?\n|\r/.test(e.value)||e.type===`break`)return n=!0,!1}),!!((!e.depth||e.depth<3)&&Ac(e)&&(t.options.setext||n))}function Wm(e,t,n,r){let i=Math.max(Math.min(6,e.depth||1),1),a=n.createTracker(r);if(Um(e,n)){let t=n.enter(`headingSetext`),r=n.enter(`phrasing`),o=n.containerPhrasing(e,{...a.current(),before:`
`,after:`
`});return r(),t(),o+`
`+(i===1?`=`:`-`).repeat(o.length-(Math.max(o.lastIndexOf(`\r`),o.lastIndexOf(`
`))+1))}let o=`#`.repeat(i),s=n.enter(`headingAtx`),c=n.enter(`phrasing`);a.move(o+` `);let l=n.containerPhrasing(e,{before:`# `,after:`
`,...a.current()});return/^[\t ]/.test(l)&&(l=zm(l.charCodeAt(0))+l.slice(1)),l=l?o+` `+l:o,n.options.closeAtx&&(l+=` `+o),c(),s(),l}Gm.peek=Km;function Gm(e){return e.value||``}function Km(){return`<`}qm.peek=Jm;function qm(e,t,n,r){let i=Im(n),a=i===`"`?`Quote`:`Apostrophe`,o=n.enter(`image`),s=n.enter(`label`),c=n.createTracker(r),l=c.move(`![`);return l+=c.move(n.safe(e.alt,{before:l,after:`]`,...c.current()})),l+=c.move(`](`),s(),!e.url&&e.title||/[\0- \u007F]/.test(e.url)?(s=n.enter(`destinationLiteral`),l+=c.move(`<`),l+=c.move(n.safe(e.url,{before:l,after:`>`,...c.current()})),l+=c.move(`>`)):(s=n.enter(`destinationRaw`),l+=c.move(n.safe(e.url,{before:l,after:e.title?` `:`)`,...c.current()}))),s(),e.title&&(s=n.enter(`title${a}`),l+=c.move(` `+i),l+=c.move(n.safe(e.title,{before:l,after:i,...c.current()})),l+=c.move(i),s()),l+=c.move(`)`),o(),l}function Jm(){return`!`}Ym.peek=Xm;function Ym(e,t,n,r){let i=e.referenceType,a=n.enter(`imageReference`),o=n.enter(`label`),s=n.createTracker(r),c=s.move(`![`),l=n.safe(e.alt,{before:c,after:`]`,...s.current()});c+=s.move(l+`][`),o();let u=n.stack;n.stack=[],o=n.enter(`reference`);let d=n.safe(n.associationId(e),{before:c,after:`]`,...s.current()});return o(),n.stack=u,a(),i===`full`||!l||l!==d?c+=s.move(d+`]`):i===`shortcut`?c=c.slice(0,-1):c+=s.move(`]`),c}function Xm(){return`!`}Zm.peek=Qm;function Zm(e,t,n){let r=e.value||``,i="`",a=-1;for(;RegExp("(^|[^`])"+i+"([^`]|$)").test(r);)i+="`";for(/[^ \r\n]/.test(r)&&(/^[ \r\n]/.test(r)&&/[ \r\n]$/.test(r)||/^`|`$/.test(r))&&(r=` `+r+` `);++a<n.unsafe.length;){let e=n.unsafe[a],t=n.compilePattern(e),i;if(e.atBreak)for(;i=t.exec(r);){let e=i.index;r.charCodeAt(e)===10&&r.charCodeAt(e-1)===13&&e--,r=r.slice(0,e)+` `+r.slice(i.index+1)}}return i+r+i}function Qm(){return"`"}function $m(e,t){let n=Ac(e);return!!(!t.options.resourceLink&&e.url&&!e.title&&e.children&&e.children.length===1&&e.children[0].type===`text`&&(n===e.url||`mailto:`+n===e.url)&&/^[a-z][a-z+.-]+:/i.test(e.url)&&!/[\0- <>\u007F]/.test(e.url))}eh.peek=th;function eh(e,t,n,r){let i=Im(n),a=i===`"`?`Quote`:`Apostrophe`,o=n.createTracker(r),s,c;if($m(e,n)){let t=n.stack;n.stack=[],s=n.enter(`autolink`);let r=o.move(`<`);return r+=o.move(n.containerPhrasing(e,{before:r,after:`>`,...o.current()})),r+=o.move(`>`),s(),n.stack=t,r}s=n.enter(`link`),c=n.enter(`label`);let l=o.move(`[`);return l+=o.move(n.containerPhrasing(e,{before:l,after:`](`,...o.current()})),l+=o.move(`](`),c(),!e.url&&e.title||/[\0- \u007F]/.test(e.url)?(c=n.enter(`destinationLiteral`),l+=o.move(`<`),l+=o.move(n.safe(e.url,{before:l,after:`>`,...o.current()})),l+=o.move(`>`)):(c=n.enter(`destinationRaw`),l+=o.move(n.safe(e.url,{before:l,after:e.title?` `:`)`,...o.current()}))),c(),e.title&&(c=n.enter(`title${a}`),l+=o.move(` `+i),l+=o.move(n.safe(e.title,{before:l,after:i,...o.current()})),l+=o.move(i),c()),l+=o.move(`)`),s(),l}function th(e,t,n){return $m(e,n)?`<`:`[`}nh.peek=rh;function nh(e,t,n,r){let i=e.referenceType,a=n.enter(`linkReference`),o=n.enter(`label`),s=n.createTracker(r),c=s.move(`[`),l=n.containerPhrasing(e,{before:c,after:`]`,...s.current()});c+=s.move(l+`][`),o();let u=n.stack;n.stack=[],o=n.enter(`reference`);let d=n.safe(n.associationId(e),{before:c,after:`]`,...s.current()});return o(),n.stack=u,a(),i===`full`||!l||l!==d?c+=s.move(d+`]`):i===`shortcut`?c=c.slice(0,-1):c+=s.move(`]`),c}function rh(){return`[`}function ih(e){let t=e.options.bullet||`*`;if(t!==`*`&&t!==`+`&&t!==`-`)throw Error("Cannot serialize items with `"+t+"` for `options.bullet`, expected `*`, `+`, or `-`");return t}function ah(e){let t=ih(e),n=e.options.bulletOther;if(!n)return t===`*`?`-`:`*`;if(n!==`*`&&n!==`+`&&n!==`-`)throw Error("Cannot serialize items with `"+n+"` for `options.bulletOther`, expected `*`, `+`, or `-`");if(n===t)throw Error("Expected `bullet` (`"+t+"`) and `bulletOther` (`"+n+"`) to be different");return n}function oh(e){let t=e.options.bulletOrdered||`.`;if(t!==`.`&&t!==`)`)throw Error("Cannot serialize items with `"+t+"` for `options.bulletOrdered`, expected `.` or `)`");return t}function sh(e){let t=e.options.rule||`*`;if(t!==`*`&&t!==`-`&&t!==`_`)throw Error("Cannot serialize rules with `"+t+"` for `options.rule`, expected `*`, `-`, or `_`");return t}function ch(e,t,n,r){let i=n.enter(`list`),a=n.bulletCurrent,o=e.ordered?oh(n):ih(n),s=e.ordered?o===`.`?`)`:`.`:ah(n),c=t&&n.bulletLastUsed?o===n.bulletLastUsed:!1;if(!e.ordered){let t=e.children?e.children[0]:void 0;if((o===`*`||o===`-`)&&t&&(!t.children||!t.children[0])&&n.stack[n.stack.length-1]===`list`&&n.stack[n.stack.length-2]===`listItem`&&n.stack[n.stack.length-3]===`list`&&n.stack[n.stack.length-4]===`listItem`&&n.indexStack[n.indexStack.length-1]===0&&n.indexStack[n.indexStack.length-2]===0&&n.indexStack[n.indexStack.length-3]===0&&(c=!0),sh(n)===o&&t){let t=-1;for(;++t<e.children.length;){let n=e.children[t];if(n&&n.type===`listItem`&&n.children&&n.children[0]&&n.children[0].type===`thematicBreak`){c=!0;break}}}}c&&(o=s),n.bulletCurrent=o;let l=n.containerFlow(e,r);return n.bulletLastUsed=o,n.bulletCurrent=a,i(),l}function lh(e){let t=e.options.listItemIndent||`one`;if(t!==`tab`&&t!==`one`&&t!==`mixed`)throw Error("Cannot serialize items with `"+t+"` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`");return t}function uh(e,t,n,r){let i=lh(n),a=n.bulletCurrent||ih(n);t&&t.type===`list`&&t.ordered&&(a=(typeof t.start==`number`&&t.start>-1?t.start:1)+(n.options.incrementListMarker===!1?0:t.children.indexOf(e))+a);let o=a.length+1;(i===`tab`||i===`mixed`&&(t&&t.type===`list`&&t.spread||e.spread))&&(o=Math.ceil(o/4)*4);let s=n.createTracker(r);s.move(a+` `.repeat(o-a.length)),s.shift(o);let c=n.enter(`listItem`),l=n.indentLines(n.containerFlow(e,s.current()),u);return c(),l;function u(e,t,n){return t?(n?``:` `.repeat(o))+e:(n?a:a+` `.repeat(o-a.length))+e}}function dh(e,t,n,r){let i=n.enter(`paragraph`),a=n.enter(`phrasing`),o=n.containerPhrasing(e,r);return a(),i(),o}var fh=_f([`break`,`delete`,`emphasis`,`footnote`,`footnoteReference`,`image`,`imageReference`,`inlineCode`,`inlineMath`,`link`,`linkReference`,`mdxJsxTextElement`,`mdxTextExpression`,`strong`,`text`,`textDirective`]);function ph(e,t,n,r){return(e.children.some(function(e){return fh(e)})?n.containerPhrasing:n.containerFlow).call(n,e,r)}function mh(e){let t=e.options.strong||`*`;if(t!==`*`&&t!==`_`)throw Error("Cannot serialize strong with `"+t+"` for `options.strong`, expected `*`, or `_`");return t}hh.peek=gh;function hh(e,t,n,r){let i=mh(n),a=n.enter(`strong`),o=n.createTracker(r),s=o.move(i+i),c=o.move(n.containerPhrasing(e,{after:i,before:s,...o.current()})),l=c.charCodeAt(0),u=Bm(r.before.charCodeAt(r.before.length-1),l,i);u.inside&&(c=zm(l)+c.slice(1));let d=c.charCodeAt(c.length-1),f=Bm(r.after.charCodeAt(0),d,i);f.inside&&(c=c.slice(0,-1)+zm(d));let p=o.move(i+i);return a(),n.attentionEncodeSurroundingInfo={after:f.outside,before:u.outside},s+c+p}function gh(e,t,n){return n.options.strong||`*`}function _h(e,t,n,r){return n.safe(e.value,r)}function vh(e){let t=e.options.ruleRepetition||3;if(t<3)throw Error("Cannot serialize rules with repetition `"+t+"` for `options.ruleRepetition`, expected `3` or more");return t}function yh(e,t,n){let r=(sh(n)+(n.options.ruleSpaces?` `:``)).repeat(vh(n));return n.options.ruleSpaces?r.slice(0,-1):r}var bh={blockquote:Em,break:Am,code:Pm,definition:Lm,emphasis:Vm,hardBreak:Am,heading:Wm,html:Gm,image:qm,imageReference:Ym,inlineCode:Zm,link:eh,linkReference:nh,list:ch,listItem:uh,paragraph:dh,root:ph,strong:hh,text:_h,thematicBreak:yh};function xh(){return{enter:{table:Sh,tableData:Eh,tableHeader:Eh,tableRow:wh},exit:{codeText:Dh,table:Ch,tableData:Th,tableHeader:Th,tableRow:Th}}}function Sh(e){let t=e._align;this.enter({type:`table`,align:t.map(function(e){return e===`none`?null:e}),children:[]},e),this.data.inTable=!0}function Ch(e){this.exit(e),this.data.inTable=void 0}function wh(e){this.enter({type:`tableRow`,children:[]},e)}function Th(e){this.exit(e)}function Eh(e){this.enter({type:`tableCell`,children:[]},e)}function Dh(e){let t=this.resume();this.data.inTable&&(t=t.replace(/\\([\\|])/g,Oh));let n=this.stack[this.stack.length-1];n.type,n.value=t,this.exit(e)}function Oh(e,t){return t===`|`?t:e}function kh(e){let t=e||{},n=t.tableCellPadding,r=t.tablePipeAlign,i=t.stringLength,a=n?` `:`|`;return{unsafe:[{character:`\r`,inConstruct:`tableCell`},{character:`
`,inConstruct:`tableCell`},{atBreak:!0,character:`|`,after:`[	 :-]`},{character:`|`,inConstruct:`tableCell`},{atBreak:!0,character:`:`,after:`-`},{atBreak:!0,character:`-`,after:`[:|-]`}],handlers:{inlineCode:f,table:o,tableCell:c,tableRow:s}};function o(e,t,n,r){return l(u(e,n,r),e.align)}function s(e,t,n,r){let i=l([d(e,n,r)]);return i.slice(0,i.indexOf(`
`))}function c(e,t,n,r){let i=n.enter(`tableCell`),o=n.enter(`phrasing`),s=n.containerPhrasing(e,{...r,before:a,after:a});return o(),i(),s}function l(e,t){return xm(e,{align:t,alignDelimiters:r,padding:n,stringLength:i})}function u(e,t,n){let r=e.children,i=-1,a=[],o=t.enter(`table`);for(;++i<r.length;)a[i]=d(r[i],t,n);return o(),a}function d(e,t,n){let r=e.children,i=-1,a=[],o=t.enter(`tableRow`);for(;++i<r.length;)a[i]=c(r[i],e,t,n);return o(),a}function f(e,t,n){let r=bh.inlineCode(e,t,n);return n.stack.includes(`tableCell`)&&(r=r.replace(/\|/g,`\\$&`)),r}}function Ah(){return{exit:{taskListCheckValueChecked:Mh,taskListCheckValueUnchecked:Mh,paragraph:Nh}}}function jh(){return{unsafe:[{atBreak:!0,character:`-`,after:`[:|-]`}],handlers:{listItem:Ph}}}function Mh(e){let t=this.stack[this.stack.length-2];t.type,t.checked=e.type===`taskListCheckValueChecked`}function Nh(e){let t=this.stack[this.stack.length-2];if(t&&t.type===`listItem`&&typeof t.checked==`boolean`){let e=this.stack[this.stack.length-1];e.type;let n=e.children[0];if(n&&n.type===`text`){let r=t.children,i=-1,a;for(;++i<r.length;){let e=r[i];if(e.type===`paragraph`){a=e;break}}a===e&&(n.value=n.value.slice(1),n.value.length===0?e.children.shift():e.position&&n.position&&typeof n.position.start.offset==`number`&&(n.position.start.column++,n.position.start.offset++,e.position.start=Object.assign({},n.position.start)))}}this.exit(e)}function Ph(e,t,n,r){let i=e.children[0],a=typeof e.checked==`boolean`&&i&&i.type===`paragraph`,o=`[`+(e.checked?`x`:` `)+`] `,s=n.createTracker(r);a&&s.move(o);let c=bh.listItem(e,t,n,{...r,...s.current()});return a&&(c=c.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/,l)),c;function l(e){return e+o}}function Fh(){return[zp(),lm(),mm(),xh(),Ah()]}function Ih(e){return{extensions:[Bp(),um(e),hm(),kh(e),jh()]}}var Lh={tokenize:Zh,partial:!0},Rh={tokenize:Qh,partial:!0},zh={tokenize:$h,partial:!0},Bh={tokenize:eg,partial:!0},Vh={tokenize:tg,partial:!0},Hh={name:`wwwAutolink`,tokenize:Yh,previous:ng},Uh={name:`protocolAutolink`,tokenize:Xh,previous:rg},Wh={name:`emailAutolink`,tokenize:Jh,previous:ig},Gh={};function Kh(){return{text:Gh}}for(var qh=48;qh<123;)Gh[qh]=Wh,qh++,qh===58?qh=65:qh===91&&(qh=97);Gh[43]=Wh,Gh[45]=Wh,Gh[46]=Wh,Gh[95]=Wh,Gh[72]=[Wh,Uh],Gh[104]=[Wh,Uh],Gh[87]=[Wh,Hh],Gh[119]=[Wh,Hh];function Jh(e,t,n){let r=this,i,a;return o;function o(t){return!ag(t)||!ig.call(r,r.previous)||og(r.events)?n(t):(e.enter(`literalAutolink`),e.enter(`literalAutolinkEmail`),s(t))}function s(t){return ag(t)?(e.consume(t),s):t===64?(e.consume(t),c):n(t)}function c(t){return t===46?e.check(Vh,u,l)(t):t===45||t===95||L(t)?(a=!0,e.consume(t),c):u(t)}function l(t){return e.consume(t),i=!0,c}function u(o){return a&&i&&Wc(r.previous)?(e.exit(`literalAutolinkEmail`),e.exit(`literalAutolink`),t(o)):n(o)}}function Yh(e,t,n){let r=this;return i;function i(t){return t!==87&&t!==119||!ng.call(r,r.previous)||og(r.events)?n(t):(e.enter(`literalAutolink`),e.enter(`literalAutolinkWww`),e.check(Lh,e.attempt(Rh,e.attempt(zh,a),n),n)(t))}function a(n){return e.exit(`literalAutolinkWww`),e.exit(`literalAutolink`),t(n)}}function Xh(e,t,n){let r=this,i=``,a=!1;return o;function o(t){return(t===72||t===104)&&rg.call(r,r.previous)&&!og(r.events)?(e.enter(`literalAutolink`),e.enter(`literalAutolinkHttp`),i+=String.fromCodePoint(t),e.consume(t),s):n(t)}function s(t){if(Wc(t)&&i.length<5)return i+=String.fromCodePoint(t),e.consume(t),s;if(t===58){let n=i.toLowerCase();if(n===`http`||n===`https`)return e.consume(t),c}return n(t)}function c(t){return t===47?(e.consume(t),a?l:(a=!0,c)):n(t)}function l(t){return t===null||Kc(t)||Xc(t)||Qc(t)||Zc(t)?n(t):e.attempt(Rh,e.attempt(zh,u),n)(t)}function u(n){return e.exit(`literalAutolinkHttp`),e.exit(`literalAutolink`),t(n)}}function Zh(e,t,n){let r=0;return i;function i(t){return(t===87||t===119)&&r<3?(r++,e.consume(t),i):t===46&&r===3?(e.consume(t),a):n(t)}function a(e){return e===null?n(e):t(e)}}function Qh(e,t,n){let r,i,a;return o;function o(t){return t===46||t===95?e.check(Bh,c,s)(t):t===null||Xc(t)||Qc(t)||t!==45&&Zc(t)?c(t):(a=!0,e.consume(t),o)}function s(t){return t===95?r=!0:(i=r,r=void 0),e.consume(t),o}function c(e){return i||r||!a?n(e):t(e)}}function $h(e,t){let n=0,r=0;return i;function i(o){return o===40?(n++,e.consume(o),i):o===41&&r<n?a(o):o===33||o===34||o===38||o===39||o===41||o===42||o===44||o===46||o===58||o===59||o===60||o===63||o===93||o===95||o===126?e.check(Bh,t,a)(o):o===null||Xc(o)||Qc(o)?t(o):(e.consume(o),i)}function a(t){return t===41&&r++,e.consume(t),i}}function eg(e,t,n){return r;function r(o){return o===33||o===34||o===39||o===41||o===42||o===44||o===46||o===58||o===59||o===63||o===95||o===126?(e.consume(o),r):o===38?(e.consume(o),a):o===93?(e.consume(o),i):o===60||o===null||Xc(o)||Qc(o)?t(o):n(o)}function i(e){return e===null||e===40||e===91||Xc(e)||Qc(e)?t(e):r(e)}function a(e){return Wc(e)?o(e):n(e)}function o(t){return t===59?(e.consume(t),r):Wc(t)?(e.consume(t),o):n(t)}}function tg(e,t,n){return r;function r(t){return e.consume(t),i}function i(e){return L(e)?n(e):t(e)}}function ng(e){return e===null||e===40||e===42||e===95||e===91||e===93||e===126||Xc(e)}function rg(e){return!Wc(e)}function ig(e){return!(e===47||ag(e))}function ag(e){return e===43||e===45||e===46||e===95||L(e)}function og(e){let t=e.length,n=!1;for(;t--;){let r=e[t][1];if((r.type===`labelLink`||r.type===`labelImage`)&&!r._balanced){n=!0;break}if(r._gfmAutolinkLiteralWalkedInto){n=!1;break}}return e.length>0&&!n&&(e[e.length-1][1]._gfmAutolinkLiteralWalkedInto=!0),n}var sg={tokenize:hg,partial:!0};function cg(){return{document:{91:{name:`gfmFootnoteDefinition`,tokenize:fg,continuation:{tokenize:pg},exit:mg}},text:{91:{name:`gfmFootnoteCall`,tokenize:dg},93:{name:`gfmPotentialFootnoteCall`,add:`after`,tokenize:lg,resolveTo:ug}}}}function lg(e,t,n){let r=this,i=r.events.length,a=r.parser.gfmFootnotes||(r.parser.gfmFootnotes=[]),o;for(;i--;){let e=r.events[i][1];if(e.type===`labelImage`){o=e;break}if(e.type===`gfmFootnoteCall`||e.type===`labelLink`||e.type===`label`||e.type===`image`||e.type===`link`)break}return s;function s(i){if(!o||!o._balanced)return n(i);let s=Uc(r.sliceSerialize({start:o.end,end:r.now()}));return s.codePointAt(0)!==94||!a.includes(s.slice(1))?n(i):(e.enter(`gfmFootnoteCallLabelMarker`),e.consume(i),e.exit(`gfmFootnoteCallLabelMarker`),t(i))}}function ug(e,t){let n=e.length;for(;n--;)if(e[n][1].type===`labelImage`&&e[n][0]===`enter`){e[n][1];break}e[n+1][1].type=`data`,e[n+3][1].type=`gfmFootnoteCallLabelMarker`;let r={type:`gfmFootnoteCall`,start:Object.assign({},e[n+3][1].start),end:Object.assign({},e[e.length-1][1].end)},i={type:`gfmFootnoteCallMarker`,start:Object.assign({},e[n+3][1].end),end:Object.assign({},e[n+3][1].end)};i.end.column++,i.end.offset++,i.end._bufferIndex++;let a={type:`gfmFootnoteCallString`,start:Object.assign({},i.end),end:Object.assign({},e[e.length-1][1].start)},o={type:`chunkString`,contentType:`string`,start:Object.assign({},a.start),end:Object.assign({},a.end)},s=[e[n+1],e[n+2],[`enter`,r,t],e[n+3],e[n+4],[`enter`,i,t],[`exit`,i,t],[`enter`,a,t],[`enter`,o,t],[`exit`,o,t],[`exit`,a,t],e[e.length-2],e[e.length-1],[`exit`,r,t]];return e.splice(n,e.length-n+1,...s),e}function dg(e,t,n){let r=this,i=r.parser.gfmFootnotes||(r.parser.gfmFootnotes=[]),a=0,o;return s;function s(t){return e.enter(`gfmFootnoteCall`),e.enter(`gfmFootnoteCallLabelMarker`),e.consume(t),e.exit(`gfmFootnoteCallLabelMarker`),c}function c(t){return t===94?(e.enter(`gfmFootnoteCallMarker`),e.consume(t),e.exit(`gfmFootnoteCallMarker`),e.enter(`gfmFootnoteCallString`),e.enter(`chunkString`).contentType=`string`,l):n(t)}function l(s){if(a>999||s===93&&!o||s===null||s===91||Xc(s))return n(s);if(s===93){e.exit(`chunkString`);let a=e.exit(`gfmFootnoteCallString`);return i.includes(Uc(r.sliceSerialize(a)))?(e.enter(`gfmFootnoteCallLabelMarker`),e.consume(s),e.exit(`gfmFootnoteCallLabelMarker`),e.exit(`gfmFootnoteCall`),t):n(s)}return Xc(s)||(o=!0),a++,e.consume(s),s===92?u:l}function u(t){return t===91||t===92||t===93?(e.consume(t),a++,l):l(t)}}function fg(e,t,n){let r=this,i=r.parser.gfmFootnotes||(r.parser.gfmFootnotes=[]),a,o=0,s;return c;function c(t){return e.enter(`gfmFootnoteDefinition`)._container=!0,e.enter(`gfmFootnoteDefinitionLabel`),e.enter(`gfmFootnoteDefinitionLabelMarker`),e.consume(t),e.exit(`gfmFootnoteDefinitionLabelMarker`),l}function l(t){return t===94?(e.enter(`gfmFootnoteDefinitionMarker`),e.consume(t),e.exit(`gfmFootnoteDefinitionMarker`),e.enter(`gfmFootnoteDefinitionLabelString`),e.enter(`chunkString`).contentType=`string`,u):n(t)}function u(t){if(o>999||t===93&&!s||t===null||t===91||Xc(t))return n(t);if(t===93){e.exit(`chunkString`);let n=e.exit(`gfmFootnoteDefinitionLabelString`);return a=Uc(r.sliceSerialize(n)),e.enter(`gfmFootnoteDefinitionLabelMarker`),e.consume(t),e.exit(`gfmFootnoteDefinitionLabelMarker`),e.exit(`gfmFootnoteDefinitionLabel`),f}return Xc(t)||(s=!0),o++,e.consume(t),t===92?d:u}function d(t){return t===91||t===92||t===93?(e.consume(t),o++,u):u(t)}function f(t){return t===58?(e.enter(`definitionMarker`),e.consume(t),e.exit(`definitionMarker`),i.includes(a)||i.push(a),B(e,p,`gfmFootnoteDefinitionWhitespace`)):n(t)}function p(e){return t(e)}}function pg(e,t,n){return e.check(hl,t,e.attempt(sg,t,n))}function mg(e){e.exit(`gfmFootnoteDefinition`)}function hg(e,t,n){let r=this;return B(e,i,`gfmFootnoteDefinitionIndent`,5);function i(e){let i=r.events[r.events.length-1];return i&&i[1].type===`gfmFootnoteDefinitionIndent`&&i[2].sliceSerialize(i[1],!0).length===4?t(e):n(e)}}function gg(e){let t=(e||{}).singleTilde,n={name:`strikethrough`,tokenize:i,resolveAll:r};return t??=!0,{text:{126:n},insideSpan:{null:[n]},attentionMarkers:{null:[126]}};function r(e,t){let n=-1;for(;++n<e.length;)if(e[n][0]===`enter`&&e[n][1].type===`strikethroughSequenceTemporary`&&e[n][1]._close){let r=n;for(;r--;)if(e[r][0]===`exit`&&e[r][1].type===`strikethroughSequenceTemporary`&&e[r][1]._open&&e[n][1].end.offset-e[n][1].start.offset===e[r][1].end.offset-e[r][1].start.offset){e[n][1].type=`strikethroughSequence`,e[r][1].type=`strikethroughSequence`;let i={type:`strikethrough`,start:Object.assign({},e[r][1].start),end:Object.assign({},e[n][1].end)},a={type:`strikethroughText`,start:Object.assign({},e[r][1].end),end:Object.assign({},e[n][1].start)},o=[[`enter`,i,t],[`enter`,e[r][1],t],[`exit`,e[r][1],t],[`enter`,a,t]],s=t.parser.constructs.insideSpan.null;s&&Ic(o,o.length,0,cl(s,e.slice(r+1,n),t)),Ic(o,o.length,0,[[`exit`,a,t],[`enter`,e[n][1],t],[`exit`,e[n][1],t],[`exit`,i,t]]),Ic(e,r-1,n-r+3,o),n=r+o.length-2;break}}for(n=-1;++n<e.length;)e[n][1].type===`strikethroughSequenceTemporary`&&(e[n][1].type=`data`);return e}function i(e,n,r){let i=this.previous,a=this.events,o=0;return s;function s(t){return i===126&&a[a.length-1][1].type!==`characterEscape`?r(t):(e.enter(`strikethroughSequenceTemporary`),c(t))}function c(a){let s=sl(i);if(a===126)return o>1?r(a):(e.consume(a),o++,c);if(o<2&&!t)return r(a);let l=e.exit(`strikethroughSequenceTemporary`),u=sl(a);return l._open=!u||u===2&&!!s,l._close=!s||s===2&&!!u,n(a)}}}var _g=class{constructor(){this.map=[]}add(e,t,n){vg(this,e,t,n)}consume(e){if(this.map.sort(function(e,t){return e[0]-t[0]}),this.map.length===0)return;let t=this.map.length,n=[];for(;t>0;)--t,n.push(e.slice(this.map[t][0]+this.map[t][1]),this.map[t][2]),e.length=this.map[t][0];n.push(e.slice()),e.length=0;let r=n.pop();for(;r;){for(let t of r)e.push(t);r=n.pop()}this.map.length=0}};function vg(e,t,n,r){let i=0;if(n!==0||r.length!==0){for(;i<e.map.length;){if(e.map[i][0]===t){e.map[i][1]+=n,e.map[i][2].push(...r);return}i+=1}e.map.push([t,n,r])}}function yg(e,t){let n=!1,r=[];for(;t<e.length;){let i=e[t];if(n){if(i[0]===`enter`)i[1].type===`tableContent`&&r.push(e[t+1][1].type===`tableDelimiterMarker`?`left`:`none`);else if(i[1].type===`tableContent`){if(e[t-1][1].type===`tableDelimiterMarker`){let e=r.length-1;r[e]=r[e]===`left`?`center`:`right`}}else if(i[1].type===`tableDelimiterRow`)break}else i[0]===`enter`&&i[1].type===`tableDelimiterRow`&&(n=!0);t+=1}return r}function bg(){return{flow:{null:{name:`table`,tokenize:xg,resolveAll:Sg}}}}function xg(e,t,n){let r=this,i=0,a=0,o;return s;function s(e){let t=r.events.length-1;for(;t>-1;){let e=r.events[t][1].type;if(e===`lineEnding`||e===`linePrefix`)t--;else break}let i=t>-1?r.events[t][1].type:null,a=i===`tableHead`||i===`tableRow`?S:c;return a===S&&r.parser.lazy[r.now().line]?n(e):a(e)}function c(t){return e.enter(`tableHead`),e.enter(`tableRow`),l(t)}function l(e){return e===124?u(e):(o=!0,a+=1,u(e))}function u(t){return t===null?n(t):R(t)?a>1?(a=0,r.interrupt=!0,e.exit(`tableRow`),e.enter(`lineEnding`),e.consume(t),e.exit(`lineEnding`),p):n(t):z(t)?B(e,u,`whitespace`)(t):(a+=1,o&&(o=!1,i+=1),t===124?(e.enter(`tableCellDivider`),e.consume(t),e.exit(`tableCellDivider`),o=!0,u):(e.enter(`data`),d(t)))}function d(t){return t===null||t===124||Xc(t)?(e.exit(`data`),u(t)):(e.consume(t),t===92?f:d)}function f(t){return t===92||t===124?(e.consume(t),d):d(t)}function p(t){return r.interrupt=!1,r.parser.lazy[r.now().line]?n(t):(e.enter(`tableDelimiterRow`),o=!1,z(t)?B(e,m,`linePrefix`,r.parser.constructs.disable.null.includes(`codeIndented`)?void 0:4)(t):m(t))}function m(t){return t===45||t===58?g(t):t===124?(o=!0,e.enter(`tableCellDivider`),e.consume(t),e.exit(`tableCellDivider`),h):x(t)}function h(t){return z(t)?B(e,g,`whitespace`)(t):g(t)}function g(t){return t===58?(a+=1,o=!0,e.enter(`tableDelimiterMarker`),e.consume(t),e.exit(`tableDelimiterMarker`),_):t===45?(a+=1,_(t)):t===null||R(t)?b(t):x(t)}function _(t){return t===45?(e.enter(`tableDelimiterFiller`),v(t)):x(t)}function v(t){return t===45?(e.consume(t),v):t===58?(o=!0,e.exit(`tableDelimiterFiller`),e.enter(`tableDelimiterMarker`),e.consume(t),e.exit(`tableDelimiterMarker`),y):(e.exit(`tableDelimiterFiller`),y(t))}function y(t){return z(t)?B(e,b,`whitespace`)(t):b(t)}function b(n){return n===124?m(n):n===null||R(n)?!o||i!==a?x(n):(e.exit(`tableDelimiterRow`),e.exit(`tableHead`),t(n)):x(n)}function x(e){return n(e)}function S(t){return e.enter(`tableRow`),C(t)}function C(n){return n===124?(e.enter(`tableCellDivider`),e.consume(n),e.exit(`tableCellDivider`),C):n===null||R(n)?(e.exit(`tableRow`),t(n)):z(n)?B(e,C,`whitespace`)(n):(e.enter(`data`),w(n))}function w(t){return t===null||t===124||Xc(t)?(e.exit(`data`),C(t)):(e.consume(t),t===92?T:w)}function T(t){return t===92||t===124?(e.consume(t),w):w(t)}}function Sg(e,t){let n=-1,r=!0,i=0,a=[0,0,0,0],o=[0,0,0,0],s=!1,c=0,l,u,d,f=new _g;for(;++n<e.length;){let p=e[n],m=p[1];p[0]===`enter`?m.type===`tableHead`?(s=!1,c!==0&&(wg(f,t,c,l,u),u=void 0,c=0),l={type:`table`,start:Object.assign({},m.start),end:Object.assign({},m.end)},f.add(n,0,[[`enter`,l,t]])):m.type===`tableRow`||m.type===`tableDelimiterRow`?(r=!0,d=void 0,a=[0,0,0,0],o=[0,n+1,0,0],s&&(s=!1,u={type:`tableBody`,start:Object.assign({},m.start),end:Object.assign({},m.end)},f.add(n,0,[[`enter`,u,t]])),i=m.type===`tableDelimiterRow`?2:u?3:1):i&&(m.type===`data`||m.type===`tableDelimiterMarker`||m.type===`tableDelimiterFiller`)?(r=!1,o[2]===0&&(a[1]!==0&&(o[0]=o[1],d=Cg(f,t,a,i,void 0,d),a=[0,0,0,0]),o[2]=n)):m.type===`tableCellDivider`&&(r?r=!1:(a[1]!==0&&(o[0]=o[1],d=Cg(f,t,a,i,void 0,d)),a=o,o=[a[1],n,0,0])):m.type===`tableHead`?(s=!0,c=n):m.type===`tableRow`||m.type===`tableDelimiterRow`?(c=n,a[1]===0?o[1]!==0&&(d=Cg(f,t,o,i,n,d)):(o[0]=o[1],d=Cg(f,t,a,i,n,d)),i=0):i&&(m.type===`data`||m.type===`tableDelimiterMarker`||m.type===`tableDelimiterFiller`)&&(o[3]=n)}for(c!==0&&wg(f,t,c,l,u),f.consume(t.events),n=-1;++n<t.events.length;){let e=t.events[n];e[0]===`enter`&&e[1].type===`table`&&(e[1]._align=yg(t.events,n))}return e}function Cg(e,t,n,r,i,a){let o=r===1?`tableHeader`:r===2?`tableDelimiter`:`tableData`;n[0]!==0&&(a.end=Object.assign({},Tg(t.events,n[0])),e.add(n[0],0,[[`exit`,a,t]]));let s=Tg(t.events,n[1]);if(a={type:o,start:Object.assign({},s),end:Object.assign({},s)},e.add(n[1],0,[[`enter`,a,t]]),n[2]!==0){let i=Tg(t.events,n[2]),a=Tg(t.events,n[3]),o={type:`tableContent`,start:Object.assign({},i),end:Object.assign({},a)};if(e.add(n[2],0,[[`enter`,o,t]]),r!==2){let r=t.events[n[2]],i=t.events[n[3]];if(r[1].end=Object.assign({},i[1].end),r[1].type=`chunkText`,r[1].contentType=`text`,n[3]>n[2]+1){let t=n[2]+1,r=n[3]-n[2]-1;e.add(t,r,[])}}e.add(n[3]+1,0,[[`exit`,o,t]])}return i!==void 0&&(a.end=Object.assign({},Tg(t.events,i)),e.add(i,0,[[`exit`,a,t]]),a=void 0),a}function wg(e,t,n,r,i){let a=[],o=Tg(t.events,n);i&&(i.end=Object.assign({},o),a.push([`exit`,i,t])),r.end=Object.assign({},o),a.push([`exit`,r,t]),e.add(n+1,0,a)}function Tg(e,t){let n=e[t],r=n[0]===`enter`?`start`:`end`;return n[1][r]}var Eg={name:`tasklistCheck`,tokenize:Og};function Dg(){return{text:{91:Eg}}}function Og(e,t,n){let r=this;return i;function i(t){return r.previous!==null||!r._gfmTasklistFirstContentOfListItem?n(t):(e.enter(`taskListCheck`),e.enter(`taskListCheckMarker`),e.consume(t),e.exit(`taskListCheckMarker`),a)}function a(t){return Xc(t)?(e.enter(`taskListCheckValueUnchecked`),e.consume(t),e.exit(`taskListCheckValueUnchecked`),o):t===88||t===120?(e.enter(`taskListCheckValueChecked`),e.consume(t),e.exit(`taskListCheckValueChecked`),o):n(t)}function o(t){return t===93?(e.enter(`taskListCheckMarker`),e.consume(t),e.exit(`taskListCheckMarker`),e.exit(`taskListCheck`),s):n(t)}function s(r){return R(r)?t(r):z(r)?e.check({tokenize:kg},t,n)(r):n(r)}}function kg(e,t,n){return B(e,r,`whitespace`);function r(e){return e===null?n(e):t(e)}}function Ag(e){return zc([Kh(),cg(),gg(e),bg(),Dg()])}var jg={};function Mg(e){let t=this,n=e||jg,r=t.data(),i=r.micromarkExtensions||=[],a=r.fromMarkdownExtensions||=[],o=r.toMarkdownExtensions||=[];i.push(Ag(n)),a.push(Fh()),o.push(Ih(n))}var Ng=/[#.]/g;function Pg(e,t){let n=e||``,r={},i=0,a,o;for(;i<n.length;){Ng.lastIndex=i;let e=Ng.exec(n),t=n.slice(i,e?e.index:n.length);t&&(a?a===`#`?r.id=t:Array.isArray(r.className)?r.className.push(t):r.className=[t]:o=t,i+=t.length),e&&(a=e[0],i++)}return{type:`element`,tagName:o||t||`div`,properties:r,children:[]}}function Fg(e,t,n){let r=n?Vg(n):void 0;function i(n,i,...a){let o;if(n==null){o={type:`root`,children:[]};let e=i;a.unshift(e)}else{o=Pg(n,t);let s=o.tagName.toLowerCase(),c=r?r.get(s):void 0;if(o.tagName=c||s,Ig(i))a.unshift(i);else for(let[t,n]of Object.entries(i))Lg(e,o.properties,t,n)}for(let e of a)Rg(o.children,e);return o.type===`element`&&o.tagName===`template`&&(o.content={type:`root`,children:o.children},o.children=[]),o}return i}function Ig(e){if(typeof e!=`object`||!e||Array.isArray(e))return!0;if(typeof e.type!=`string`)return!1;let t=e,n=Object.keys(e);for(let e of n){let n=t[e];if(n&&typeof n==`object`){if(!Array.isArray(n))return!0;let e=n;for(let t of e)if(typeof t!=`number`&&typeof t!=`string`)return!0}}return!!(`children`in e&&Array.isArray(e.children))}function Lg(e,t,n,r){let i=Ps(e,n),a;if(r!=null){if(typeof r==`number`){if(Number.isNaN(r))return;a=r}else a=typeof r==`boolean`?r:typeof r==`string`?i.spaceSeparated?zs(r):i.commaSeparated?Zo(r):i.commaOrSpaceSeparated?zs(Zo(r).join(` `)):zg(i,i.property,r):Array.isArray(r)?[...r]:i.property===`style`?Bg(r):String(r);if(Array.isArray(a)){let e=[];for(let t of a)e.push(zg(i,i.property,t));a=e}i.property===`className`&&Array.isArray(t.className)&&(a=t.className.concat(a)),t[i.property]=a}}function Rg(e,t){if(t!=null){if(typeof t==`number`||typeof t==`string`)e.push({type:`text`,value:String(t)});else if(Array.isArray(t))for(let n of t)Rg(e,n);else if(typeof t==`object`&&`type`in t)t.type===`root`?Rg(e,t.children):e.push(t);else throw Error("Expected node, nodes, or string, got `"+t+"`")}}function zg(e,t,n){if(typeof n==`string`){if(e.number&&n&&!Number.isNaN(Number(n)))return Number(n);if((e.boolean||e.overloadedBoolean)&&(n===``||cs(n)===cs(t)))return!0}return n}function Bg(e){let t=[];for(let[n,r]of Object.entries(e))t.push([n,r].join(`: `));return t.join(`; `)}function Vg(e){let t=new Map;for(let n of e)t.set(n.toLowerCase(),n);return t}var Hg=`altGlyph.altGlyphDef.altGlyphItem.animateColor.animateMotion.animateTransform.clipPath.feBlend.feColorMatrix.feComponentTransfer.feComposite.feConvolveMatrix.feDiffuseLighting.feDisplacementMap.feDistantLight.feDropShadow.feFlood.feFuncA.feFuncB.feFuncG.feFuncR.feGaussianBlur.feImage.feMerge.feMergeNode.feMorphology.feOffset.fePointLight.feSpecularLighting.feSpotLight.feTile.feTurbulence.foreignObject.glyphRef.linearGradient.radialGradient.solidColor.textArea.textPath`.split(`.`),Ug=Fg(Ls,`div`),Wg=Fg(Rs,`g`,Hg);function Gg(e){let t=String(e),n=[];return{toOffset:i,toPoint:r};function r(e){if(typeof e==`number`&&e>-1&&e<=t.length){let r=0;for(;;){let i=n[r];if(i===void 0){let e=Kg(t,n[r-1]);i=e===-1?t.length+1:e+1,n[r]=i}if(i>e)return{line:r+1,column:e-(r>0?n[r-1]:0)+1,offset:e};r++}}}function i(e){if(e&&typeof e.line==`number`&&typeof e.column==`number`&&!Number.isNaN(e.line)&&!Number.isNaN(e.column)){for(;n.length<e.line;){let e=n[n.length-1],r=Kg(t,e),i=r===-1?t.length+1:r+1;if(e===i)break;n.push(i)}let r=(e.line>1?n[e.line-2]:0)+e.column-1;if(r<n[e.line-1])return r}}}function Kg(e,t){let n=e.indexOf(`\r`,t),r=e.indexOf(`
`,t);return r===-1?n:n===-1||n+1===r?r:n<r?n:r}var qg={html:`http://www.w3.org/1999/xhtml`,mathml:`http://www.w3.org/1998/Math/MathML`,svg:`http://www.w3.org/2000/svg`,xlink:`http://www.w3.org/1999/xlink`,xml:`http://www.w3.org/XML/1998/namespace`,xmlns:`http://www.w3.org/2000/xmlns/`},Jg={}.hasOwnProperty,Yg=Object.prototype;function Xg(e,t){let n=t||{};return Zg({file:n.file||void 0,location:!1,schema:n.space===`svg`?Rs:Ls,verbose:n.verbose||!1},e)}function Zg(e,t){let n;switch(t.nodeName){case`#comment`:{let r=t;return n={type:`comment`,value:r.data},e_(e,r,n),n}case`#document`:case`#document-fragment`:{let r=t,i=`mode`in r?r.mode===`quirks`||r.mode===`limited-quirks`:!1;if(n={type:`root`,children:Qg(e,t.childNodes),data:{quirksMode:i}},e.file&&e.location){let t=String(e.file),r=Gg(t),i=r.toPoint(0),a=r.toPoint(t.length);n.position={start:i,end:a}}return n}case`#documentType`:{let r=t;return n={type:`doctype`},e_(e,r,n),n}case`#text`:{let r=t;return n={type:`text`,value:r.value},e_(e,r,n),n}default:return n=$g(e,t),n}}function Qg(e,t){let n=-1,r=[];for(;++n<t.length;){let i=Zg(e,t[n]);r.push(i)}return r}function $g(e,t){let n=e.schema;e.schema=t.namespaceURI===qg.svg?Rs:Ls;let r=-1,i={};for(;++r<t.attrs.length;){let e=t.attrs[r],n=(e.prefix?e.prefix+`:`:``)+e.name;Jg.call(Yg,n)||(i[n]=e.value)}let a=(e.schema.space===`svg`?Wg:Ug)(t.tagName,i,Qg(e,t.childNodes));if(e_(e,t,a),a.tagName===`template`){let n=t,r=n.sourceCodeLocation,i=r&&r.startTag&&n_(r.startTag),o=r&&r.endTag&&n_(r.endTag),s=Zg(e,n.content);i&&o&&e.file&&(s.position={start:i.end,end:o.start}),a.content=s}return e.schema=n,a}function e_(e,t,n){if(`sourceCodeLocation`in t&&t.sourceCodeLocation&&e.file){let r=t_(e,n,t.sourceCodeLocation);r&&(e.location=!0,n.position=r)}}function t_(e,t,n){let r=n_(n);if(t.type===`element`){let i=t.children[t.children.length-1];if(r&&!n.endTag&&i&&i.position&&i.position.end&&(r.end=Object.assign({},i.position.end)),e.verbose){let r={},i;if(n.attrs)for(i in n.attrs)Jg.call(n.attrs,i)&&(r[Ps(e.schema,i).property]=n_(n.attrs[i]));n.startTag;let a=n_(n.startTag),o=n.endTag?n_(n.endTag):void 0,s={opening:a};o&&(s.closing=o),s.properties=r,t.data={position:s}}}return r}function n_(e){let t=r_({line:e.startLine,column:e.startCol,offset:e.startOffset}),n=r_({line:e.endLine,column:e.endCol,offset:e.endOffset});return t||n?{start:t,end:n}:void 0}function r_(e){return e.line&&e.column?e:void 0}var i_={},a_={}.hasOwnProperty,o_=Tm(`type`,{handlers:{root:c_,element:p_,text:d_,comment:f_,doctype:u_}});function s_(e,t){let n=(t||i_).space;return o_(e,n===`svg`?Rs:Ls)}function c_(e,t){let n={nodeName:`#document`,mode:(e.data||{}).quirksMode?`quirks`:`no-quirks`,childNodes:[]};return n.childNodes=h_(e.children,n,t),g_(e,n),n}function l_(e,t){let n={nodeName:`#document-fragment`,childNodes:[]};return n.childNodes=h_(e.children,n,t),g_(e,n),n}function u_(e){let t={nodeName:`#documentType`,name:`html`,publicId:``,systemId:``,parentNode:null};return g_(e,t),t}function d_(e){let t={nodeName:`#text`,value:e.value,parentNode:null};return g_(e,t),t}function f_(e){let t={nodeName:`#comment`,data:e.value,parentNode:null};return g_(e,t),t}function p_(e,t){let n=t,r=n;e.type===`element`&&e.tagName.toLowerCase()===`svg`&&n.space===`html`&&(r=Rs);let i=[],a;if(e.properties){for(a in e.properties)if(a!==`children`&&a_.call(e.properties,a)){let t=m_(r,a,e.properties[a]);t&&i.push(t)}}let o=r.space,s={nodeName:e.tagName,tagName:e.tagName,attrs:i,namespaceURI:qg[o],childNodes:[],parentNode:null};return s.childNodes=h_(e.children,s,r),g_(e,s),e.tagName===`template`&&e.content&&(s.content=l_(e.content,r)),s}function m_(e,t,n){let r=Ps(e,t);if(n===!1||n==null||typeof n==`number`&&Number.isNaN(n)||!n&&r.boolean)return;Array.isArray(n)&&(n=r.commaSeparated?Qo(n):Bs(n));let i={name:r.attribute,value:n===!0?``:String(n)};if(r.space&&r.space!==`html`&&r.space!==`svg`){let e=i.name.indexOf(`:`);e<0?i.prefix=``:(i.name=i.name.slice(e+1),i.prefix=r.attribute.slice(0,e)),i.namespace=qg[r.space]}return i}function h_(e,t,n){let r=-1,i=[];if(e)for(;++r<e.length;){let a=o_(e[r],n);a.parentNode=t,i.push(a)}return i}function g_(e,t){let n=e.position;n&&n.start&&n.end&&(n.start.offset,n.end.offset,t.sourceCodeLocation={startLine:n.start.line,startCol:n.start.column,startOffset:n.start.offset,endLine:n.end.line,endCol:n.end.column,endOffset:n.end.offset})}var __=[`area`,`base`,`basefont`,`bgsound`,`br`,`col`,`command`,`embed`,`frame`,`hr`,`image`,`img`,`input`,`keygen`,`link`,`meta`,`param`,`source`,`track`,`wbr`],v_=new Set([65534,65535,131070,131071,196606,196607,262142,262143,327678,327679,393214,393215,458750,458751,524286,524287,589822,589823,655358,655359,720894,720895,786430,786431,851966,851967,917502,917503,983038,983039,1048574,1048575,1114110,1114111]),G;(function(e){e[e.EOF=-1]=`EOF`,e[e.NULL=0]=`NULL`,e[e.TABULATION=9]=`TABULATION`,e[e.CARRIAGE_RETURN=13]=`CARRIAGE_RETURN`,e[e.LINE_FEED=10]=`LINE_FEED`,e[e.FORM_FEED=12]=`FORM_FEED`,e[e.SPACE=32]=`SPACE`,e[e.EXCLAMATION_MARK=33]=`EXCLAMATION_MARK`,e[e.QUOTATION_MARK=34]=`QUOTATION_MARK`,e[e.AMPERSAND=38]=`AMPERSAND`,e[e.APOSTROPHE=39]=`APOSTROPHE`,e[e.HYPHEN_MINUS=45]=`HYPHEN_MINUS`,e[e.SOLIDUS=47]=`SOLIDUS`,e[e.DIGIT_0=48]=`DIGIT_0`,e[e.DIGIT_9=57]=`DIGIT_9`,e[e.SEMICOLON=59]=`SEMICOLON`,e[e.LESS_THAN_SIGN=60]=`LESS_THAN_SIGN`,e[e.EQUALS_SIGN=61]=`EQUALS_SIGN`,e[e.GREATER_THAN_SIGN=62]=`GREATER_THAN_SIGN`,e[e.QUESTION_MARK=63]=`QUESTION_MARK`,e[e.LATIN_CAPITAL_A=65]=`LATIN_CAPITAL_A`,e[e.LATIN_CAPITAL_Z=90]=`LATIN_CAPITAL_Z`,e[e.RIGHT_SQUARE_BRACKET=93]=`RIGHT_SQUARE_BRACKET`,e[e.GRAVE_ACCENT=96]=`GRAVE_ACCENT`,e[e.LATIN_SMALL_A=97]=`LATIN_SMALL_A`,e[e.LATIN_SMALL_Z=122]=`LATIN_SMALL_Z`})(G||={});var y_={DASH_DASH:`--`,CDATA_START:`[CDATA[`,DOCTYPE:`doctype`,SCRIPT:`script`,PUBLIC:`public`,SYSTEM:`system`};function b_(e){return e>=55296&&e<=57343}function x_(e){return e>=56320&&e<=57343}function S_(e,t){return(e-55296)*1024+9216+t}function C_(e){return e!==32&&e!==10&&e!==13&&e!==9&&e!==12&&e>=1&&e<=31||e>=127&&e<=159}function w_(e){return e>=64976&&e<=65007||v_.has(e)}var K;(function(e){e.controlCharacterInInputStream=`control-character-in-input-stream`,e.noncharacterInInputStream=`noncharacter-in-input-stream`,e.surrogateInInputStream=`surrogate-in-input-stream`,e.nonVoidHtmlElementStartTagWithTrailingSolidus=`non-void-html-element-start-tag-with-trailing-solidus`,e.endTagWithAttributes=`end-tag-with-attributes`,e.endTagWithTrailingSolidus=`end-tag-with-trailing-solidus`,e.unexpectedSolidusInTag=`unexpected-solidus-in-tag`,e.unexpectedNullCharacter=`unexpected-null-character`,e.unexpectedQuestionMarkInsteadOfTagName=`unexpected-question-mark-instead-of-tag-name`,e.invalidFirstCharacterOfTagName=`invalid-first-character-of-tag-name`,e.unexpectedEqualsSignBeforeAttributeName=`unexpected-equals-sign-before-attribute-name`,e.missingEndTagName=`missing-end-tag-name`,e.unexpectedCharacterInAttributeName=`unexpected-character-in-attribute-name`,e.unknownNamedCharacterReference=`unknown-named-character-reference`,e.missingSemicolonAfterCharacterReference=`missing-semicolon-after-character-reference`,e.unexpectedCharacterAfterDoctypeSystemIdentifier=`unexpected-character-after-doctype-system-identifier`,e.unexpectedCharacterInUnquotedAttributeValue=`unexpected-character-in-unquoted-attribute-value`,e.eofBeforeTagName=`eof-before-tag-name`,e.eofInTag=`eof-in-tag`,e.missingAttributeValue=`missing-attribute-value`,e.missingWhitespaceBetweenAttributes=`missing-whitespace-between-attributes`,e.missingWhitespaceAfterDoctypePublicKeyword=`missing-whitespace-after-doctype-public-keyword`,e.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers=`missing-whitespace-between-doctype-public-and-system-identifiers`,e.missingWhitespaceAfterDoctypeSystemKeyword=`missing-whitespace-after-doctype-system-keyword`,e.missingQuoteBeforeDoctypePublicIdentifier=`missing-quote-before-doctype-public-identifier`,e.missingQuoteBeforeDoctypeSystemIdentifier=`missing-quote-before-doctype-system-identifier`,e.missingDoctypePublicIdentifier=`missing-doctype-public-identifier`,e.missingDoctypeSystemIdentifier=`missing-doctype-system-identifier`,e.abruptDoctypePublicIdentifier=`abrupt-doctype-public-identifier`,e.abruptDoctypeSystemIdentifier=`abrupt-doctype-system-identifier`,e.cdataInHtmlContent=`cdata-in-html-content`,e.incorrectlyOpenedComment=`incorrectly-opened-comment`,e.eofInScriptHtmlCommentLikeText=`eof-in-script-html-comment-like-text`,e.eofInDoctype=`eof-in-doctype`,e.nestedComment=`nested-comment`,e.abruptClosingOfEmptyComment=`abrupt-closing-of-empty-comment`,e.eofInComment=`eof-in-comment`,e.incorrectlyClosedComment=`incorrectly-closed-comment`,e.eofInCdata=`eof-in-cdata`,e.absenceOfDigitsInNumericCharacterReference=`absence-of-digits-in-numeric-character-reference`,e.nullCharacterReference=`null-character-reference`,e.surrogateCharacterReference=`surrogate-character-reference`,e.characterReferenceOutsideUnicodeRange=`character-reference-outside-unicode-range`,e.controlCharacterReference=`control-character-reference`,e.noncharacterCharacterReference=`noncharacter-character-reference`,e.missingWhitespaceBeforeDoctypeName=`missing-whitespace-before-doctype-name`,e.missingDoctypeName=`missing-doctype-name`,e.invalidCharacterSequenceAfterDoctypeName=`invalid-character-sequence-after-doctype-name`,e.duplicateAttribute=`duplicate-attribute`,e.nonConformingDoctype=`non-conforming-doctype`,e.missingDoctype=`missing-doctype`,e.misplacedDoctype=`misplaced-doctype`,e.endTagWithoutMatchingOpenElement=`end-tag-without-matching-open-element`,e.closingOfElementWithOpenChildElements=`closing-of-element-with-open-child-elements`,e.disallowedContentInNoscriptInHead=`disallowed-content-in-noscript-in-head`,e.openElementsLeftAfterEof=`open-elements-left-after-eof`,e.abandonedHeadElementChild=`abandoned-head-element-child`,e.misplacedStartTagForHeadElement=`misplaced-start-tag-for-head-element`,e.nestedNoscriptInHead=`nested-noscript-in-head`,e.eofInElementThatCanContainOnlyText=`eof-in-element-that-can-contain-only-text`})(K||={});var T_=65536,E_=class{constructor(e){this.handler=e,this.html=``,this.pos=-1,this.lastGapPos=-2,this.gapStack=[],this.skipNextNewLine=!1,this.lastChunkWritten=!1,this.endOfChunkHit=!1,this.bufferWaterline=T_,this.isEol=!1,this.lineStartPos=0,this.droppedBufferSize=0,this.line=1,this.lastErrOffset=-1}get col(){return this.pos-this.lineStartPos+Number(this.lastGapPos!==this.pos)}get offset(){return this.droppedBufferSize+this.pos}getError(e,t){let{line:n,col:r,offset:i}=this,a=r+t,o=i+t;return{code:e,startLine:n,endLine:n,startCol:a,endCol:a,startOffset:o,endOffset:o}}_err(e){this.handler.onParseError&&this.lastErrOffset!==this.offset&&(this.lastErrOffset=this.offset,this.handler.onParseError(this.getError(e,0)))}_addGap(){this.gapStack.push(this.lastGapPos),this.lastGapPos=this.pos}_processSurrogate(e){if(this.pos!==this.html.length-1){let t=this.html.charCodeAt(this.pos+1);if(x_(t))return this.pos++,this._addGap(),S_(e,t)}else if(!this.lastChunkWritten)return this.endOfChunkHit=!0,G.EOF;return this._err(K.surrogateInInputStream),e}willDropParsedChunk(){return this.pos>this.bufferWaterline}dropParsedChunk(){this.willDropParsedChunk()&&(this.html=this.html.substring(this.pos),this.lineStartPos-=this.pos,this.droppedBufferSize+=this.pos,this.pos=0,this.lastGapPos=-2,this.gapStack.length=0)}write(e,t){this.html.length>0?this.html+=e:this.html=e,this.endOfChunkHit=!1,this.lastChunkWritten=t}insertHtmlAtCurrentPos(e){this.html=this.html.substring(0,this.pos+1)+e+this.html.substring(this.pos+1),this.endOfChunkHit=!1}startsWith(e,t){if(this.pos+e.length>this.html.length)return this.endOfChunkHit=!this.lastChunkWritten,!1;if(t)return this.html.startsWith(e,this.pos);for(let t=0;t<e.length;t++)if((this.html.charCodeAt(this.pos+t)|32)!==e.charCodeAt(t))return!1;return!0}peek(e){let t=this.pos+e;if(t>=this.html.length)return this.endOfChunkHit=!this.lastChunkWritten,G.EOF;let n=this.html.charCodeAt(t);return n===G.CARRIAGE_RETURN?G.LINE_FEED:n}advance(){if(this.pos++,this.isEol&&(this.isEol=!1,this.line++,this.lineStartPos=this.pos),this.pos>=this.html.length)return this.endOfChunkHit=!this.lastChunkWritten,G.EOF;let e=this.html.charCodeAt(this.pos);return e===G.CARRIAGE_RETURN?(this.isEol=!0,this.skipNextNewLine=!0,G.LINE_FEED):e===G.LINE_FEED&&(this.isEol=!0,this.skipNextNewLine)?(this.line--,this.skipNextNewLine=!1,this._addGap(),this.advance()):(this.skipNextNewLine=!1,b_(e)&&(e=this._processSurrogate(e)),this.handler.onParseError===null||e>31&&e<127||e===G.LINE_FEED||e===G.CARRIAGE_RETURN||e>159&&e<64976||this._checkForProblematicCharacters(e),e)}_checkForProblematicCharacters(e){C_(e)?this._err(K.controlCharacterInInputStream):w_(e)&&this._err(K.noncharacterInInputStream)}retreat(e){for(this.pos-=e;this.pos<this.lastGapPos;)this.lastGapPos=this.gapStack.pop(),this.pos--;this.isEol=!1}},q;(function(e){e[e.CHARACTER=0]=`CHARACTER`,e[e.NULL_CHARACTER=1]=`NULL_CHARACTER`,e[e.WHITESPACE_CHARACTER=2]=`WHITESPACE_CHARACTER`,e[e.START_TAG=3]=`START_TAG`,e[e.END_TAG=4]=`END_TAG`,e[e.COMMENT=5]=`COMMENT`,e[e.DOCTYPE=6]=`DOCTYPE`,e[e.EOF=7]=`EOF`,e[e.HIBERNATION=8]=`HIBERNATION`})(q||={});function D_(e,t){for(let n=e.attrs.length-1;n>=0;n--)if(e.attrs[n].name===t)return e.attrs[n].value;return null}var O_=new Uint16Array(`ᵁ<Õıʊҝջאٵ۞ޢߖࠏ੊ઑඡ๭༉༦჊ረዡᐕᒝᓃᓟᔥ\0\0\0\0\0\0ᕫᛍᦍᰒᷝ὾⁠↰⊍⏀⏻⑂⠤⤒ⴈ⹈⿎〖㊺㘹㞬㣾㨨㩱㫠㬮ࠀEMabcfglmnoprstu\\bfms¦³¹ÈÏlig耻Æ䃆P耻&䀦cute耻Á䃁reve;䄂Āiyx}rc耻Â䃂;䐐r;쀀𝔄rave耻À䃀pha;䎑acr;䄀d;橓Āgp¡on;䄄f;쀀𝔸plyFunction;恡ing耻Å䃅Ācs¾Ãr;쀀𝒜ign;扔ilde耻Ã䃃ml耻Ä䃄ЀaceforsuåûþėĜĢħĪĀcrêòkslash;或Ŷöø;櫧ed;挆y;䐑ƀcrtąċĔause;戵noullis;愬a;䎒r;쀀𝔅pf;쀀𝔹eve;䋘còēmpeq;扎܀HOacdefhilorsuōőŖƀƞƢƵƷƺǜȕɳɸɾcy;䐧PY耻©䂩ƀcpyŝŢźute;䄆Ā;iŧŨ拒talDifferentialD;慅leys;愭ȀaeioƉƎƔƘron;䄌dil耻Ç䃇rc;䄈nint;戰ot;䄊ĀdnƧƭilla;䂸terDot;䂷òſi;䎧rcleȀDMPTǇǋǑǖot;抙inus;抖lus;投imes;抗oĀcsǢǸkwiseContourIntegral;戲eCurlyĀDQȃȏoubleQuote;思uote;怙ȀlnpuȞȨɇɕonĀ;eȥȦ户;橴ƀgitȯȶȺruent;扡nt;戯ourIntegral;戮ĀfrɌɎ;愂oduct;成nterClockwiseContourIntegral;戳oss;樯cr;쀀𝒞pĀ;Cʄʅ拓ap;才րDJSZacefiosʠʬʰʴʸˋ˗ˡ˦̳ҍĀ;oŹʥtrahd;椑cy;䐂cy;䐅cy;䐏ƀgrsʿ˄ˇger;怡r;憡hv;櫤Āayː˕ron;䄎;䐔lĀ;t˝˞戇a;䎔r;쀀𝔇Āaf˫̧Ācm˰̢riticalȀADGT̖̜̀̆cute;䂴oŴ̋̍;䋙bleAcute;䋝rave;䁠ilde;䋜ond;拄ferentialD;慆Ѱ̽\0\0\0͔͂\0Ѕf;쀀𝔻ƀ;DE͈͉͍䂨ot;惜qual;扐blèCDLRUVͣͲ΂ϏϢϸontourIntegraìȹoɴ͹\0\0ͻ»͉nArrow;懓Āeo·ΤftƀARTΐΖΡrrow;懐ightArrow;懔eåˊngĀLRΫτeftĀARγιrrow;柸ightArrow;柺ightArrow;柹ightĀATϘϞrrow;懒ee;抨pɁϩ\0\0ϯrrow;懑ownArrow;懕erticalBar;戥ǹABLRTaВЪаўѿͼrrowƀ;BUНОТ憓ar;椓pArrow;懵reve;䌑eft˒к\0ц\0ѐightVector;楐eeVector;楞ectorĀ;Bљњ憽ar;楖ightǔѧ\0ѱeeVector;楟ectorĀ;BѺѻ懁ar;楗eeĀ;A҆҇护rrow;憧ĀctҒҗr;쀀𝒟rok;䄐ࠀNTacdfglmopqstuxҽӀӄӋӞӢӧӮӵԡԯԶՒ՝ՠեG;䅊H耻Ð䃐cute耻É䃉ƀaiyӒӗӜron;䄚rc耻Ê䃊;䐭ot;䄖r;쀀𝔈rave耻È䃈ement;戈ĀapӺӾcr;䄒tyɓԆ\0\0ԒmallSquare;旻erySmallSquare;斫ĀgpԦԪon;䄘f;쀀𝔼silon;䎕uĀaiԼՉlĀ;TՂՃ橵ilde;扂librium;懌Āci՗՚r;愰m;橳a;䎗ml耻Ë䃋Āipժկsts;戃onentialE;慇ʀcfiosօֈ֍ֲ׌y;䐤r;쀀𝔉lledɓ֗\0\0֣mallSquare;旼erySmallSquare;斪Ͱֺ\0ֿ\0\0ׄf;쀀𝔽All;戀riertrf;愱cò׋؀JTabcdfgorstר׬ׯ׺؀ؒؖ؛؝أ٬ٲcy;䐃耻>䀾mmaĀ;d׷׸䎓;䏜reve;䄞ƀeiy؇،ؐdil;䄢rc;䄜;䐓ot;䄠r;쀀𝔊;拙pf;쀀𝔾eater̀EFGLSTصلَٖٛ٦qualĀ;Lؾؿ扥ess;招ullEqual;执reater;檢ess;扷lantEqual;橾ilde;扳cr;쀀𝒢;扫ЀAacfiosuڅڋږڛڞڪھۊRDcy;䐪Āctڐڔek;䋇;䁞irc;䄤r;愌lbertSpace;愋ǰگ\0ڲf;愍izontalLine;攀Āctۃۅòکrok;䄦mpńېۘownHumðįqual;扏܀EJOacdfgmnostuۺ۾܃܇܎ܚܞܡܨ݄ݸދޏޕcy;䐕lig;䄲cy;䐁cute耻Í䃍Āiyܓܘrc耻Î䃎;䐘ot;䄰r;愑rave耻Ì䃌ƀ;apܠܯܿĀcgܴܷr;䄪inaryI;慈lieóϝǴ݉\0ݢĀ;eݍݎ戬Āgrݓݘral;戫section;拂isibleĀCTݬݲomma;恣imes;恢ƀgptݿރވon;䄮f;쀀𝕀a;䎙cr;愐ilde;䄨ǫޚ\0ޞcy;䐆l耻Ï䃏ʀcfosuެ޷޼߂ߐĀiyޱ޵rc;䄴;䐙r;쀀𝔍pf;쀀𝕁ǣ߇\0ߌr;쀀𝒥rcy;䐈kcy;䐄΀HJacfosߤߨ߽߬߱ࠂࠈcy;䐥cy;䐌ppa;䎚Āey߶߻dil;䄶;䐚r;쀀𝔎pf;쀀𝕂cr;쀀𝒦րJTaceflmostࠥࠩࠬࡐࡣ঳সে্਷ੇcy;䐉耻<䀼ʀcmnpr࠷࠼ࡁࡄࡍute;䄹bda;䎛g;柪lacetrf;愒r;憞ƀaeyࡗ࡜ࡡron;䄽dil;䄻;䐛Āfsࡨ॰tԀACDFRTUVarࡾࢩࢱࣦ࣠ࣼयज़ΐ४Ānrࢃ࢏gleBracket;柨rowƀ;BR࢙࢚࢞憐ar;懤ightArrow;懆eiling;挈oǵࢷ\0ࣃbleBracket;柦nǔࣈ\0࣒eeVector;楡ectorĀ;Bࣛࣜ懃ar;楙loor;挊ightĀAV࣯ࣵrrow;憔ector;楎Āerँगeƀ;AVउऊऐ抣rrow;憤ector;楚iangleƀ;BEतथऩ抲ar;槏qual;抴pƀDTVषूौownVector;楑eeVector;楠ectorĀ;Bॖॗ憿ar;楘ectorĀ;B॥०憼ar;楒ightáΜs̀EFGLSTॾঋকঝঢভqualGreater;拚ullEqual;扦reater;扶ess;檡lantEqual;橽ilde;扲r;쀀𝔏Ā;eঽা拘ftarrow;懚idot;䄿ƀnpw৔ਖਛgȀLRlr৞৷ਂਐeftĀAR০৬rrow;柵ightArrow;柷ightArrow;柶eftĀarγਊightáοightáϊf;쀀𝕃erĀLRਢਬeftArrow;憙ightArrow;憘ƀchtਾੀੂòࡌ;憰rok;䅁;扪Ѐacefiosuਗ਼੝੠੷੼અઋ઎p;椅y;䐜Ādl੥੯iumSpace;恟lintrf;愳r;쀀𝔐nusPlus;戓pf;쀀𝕄cò੶;䎜ҀJacefostuણધભીଔଙඑ඗ඞcy;䐊cute;䅃ƀaey઴હાron;䅇dil;䅅;䐝ƀgswે૰଎ativeƀMTV૓૟૨ediumSpace;怋hiĀcn૦૘ë૙eryThiî૙tedĀGL૸ଆreaterGreateòٳessLesóੈLine;䀊r;쀀𝔑ȀBnptଢନଷ଺reak;恠BreakingSpace;䂠f;愕ڀ;CDEGHLNPRSTV୕ୖ୪୼஡௫ఄ౞಄ದ೘ൡඅ櫬Āou୛୤ngruent;扢pCap;扭oubleVerticalBar;戦ƀlqxஃஊ஛ement;戉ualĀ;Tஒஓ扠ilde;쀀≂̸ists;戄reater΀;EFGLSTஶஷ஽௉௓௘௥扯qual;扱ullEqual;쀀≧̸reater;쀀≫̸ess;批lantEqual;쀀⩾̸ilde;扵umpń௲௽ownHump;쀀≎̸qual;쀀≏̸eĀfsఊధtTriangleƀ;BEచఛడ拪ar;쀀⧏̸qual;括s̀;EGLSTవశ఼ౄోౘ扮qual;扰reater;扸ess;쀀≪̸lantEqual;쀀⩽̸ilde;扴estedĀGL౨౹reaterGreater;쀀⪢̸essLess;쀀⪡̸recedesƀ;ESಒಓಛ技qual;쀀⪯̸lantEqual;拠ĀeiಫಹverseElement;戌ghtTriangleƀ;BEೋೌ೒拫ar;쀀⧐̸qual;拭ĀquೝഌuareSuĀbp೨೹setĀ;E೰ೳ쀀⊏̸qual;拢ersetĀ;Eഃആ쀀⊐̸qual;拣ƀbcpഓതൎsetĀ;Eഛഞ쀀⊂⃒qual;抈ceedsȀ;ESTലള഻െ抁qual;쀀⪰̸lantEqual;拡ilde;쀀≿̸ersetĀ;E൘൛쀀⊃⃒qual;抉ildeȀ;EFT൮൯൵ൿ扁qual;扄ullEqual;扇ilde;扉erticalBar;戤cr;쀀𝒩ilde耻Ñ䃑;䎝܀Eacdfgmoprstuvලෂ෉෕ෛ෠෧෼ขภยา฿ไlig;䅒cute耻Ó䃓Āiy෎ීrc耻Ô䃔;䐞blac;䅐r;쀀𝔒rave耻Ò䃒ƀaei෮ෲ෶cr;䅌ga;䎩cron;䎟pf;쀀𝕆enCurlyĀDQฎบoubleQuote;怜uote;怘;橔Āclวฬr;쀀𝒪ash耻Ø䃘iŬื฼de耻Õ䃕es;樷ml耻Ö䃖erĀBP๋๠Āar๐๓r;怾acĀek๚๜;揞et;掴arenthesis;揜Ҁacfhilors๿ງຊຏຒດຝະ໼rtialD;戂y;䐟r;쀀𝔓i;䎦;䎠usMinus;䂱Āipຢອncareplanåڝf;愙Ȁ;eio຺ູ໠໤檻cedesȀ;EST່້໏໚扺qual;檯lantEqual;扼ilde;找me;怳Ādp໩໮uct;戏ortionĀ;aȥ໹l;戝Āci༁༆r;쀀𝒫;䎨ȀUfos༑༖༛༟OT耻"䀢r;쀀𝔔pf;愚cr;쀀𝒬؀BEacefhiorsu༾གྷཇའཱིྦྷྪྭ႖ႩႴႾarr;椐G耻®䂮ƀcnrཎནབute;䅔g;柫rĀ;tཛྷཝ憠l;椖ƀaeyཧཬཱron;䅘dil;䅖;䐠Ā;vླྀཹ愜erseĀEUྂྙĀlq྇ྎement;戋uilibrium;懋pEquilibrium;楯r»ཹo;䎡ghtЀACDFTUVa࿁࿫࿳ဢဨၛႇϘĀnr࿆࿒gleBracket;柩rowƀ;BL࿜࿝࿡憒ar;懥eftArrow;懄eiling;按oǵ࿹\0စbleBracket;柧nǔည\0နeeVector;楝ectorĀ;Bဝသ懂ar;楕loor;挋Āerိ၃eƀ;AVဵံြ抢rrow;憦ector;楛iangleƀ;BEၐၑၕ抳ar;槐qual;抵pƀDTVၣၮၸownVector;楏eeVector;楜ectorĀ;Bႂႃ憾ar;楔ectorĀ;B႑႒懀ar;楓Āpuႛ႞f;愝ndImplies;楰ightarrow;懛ĀchႹႼr;愛;憱leDelayed;槴ڀHOacfhimoqstuფჱჷჽᄙᄞᅑᅖᅡᅧᆵᆻᆿĀCcჩხHcy;䐩y;䐨FTcy;䐬cute;䅚ʀ;aeiyᄈᄉᄎᄓᄗ檼ron;䅠dil;䅞rc;䅜;䐡r;쀀𝔖ortȀDLRUᄪᄴᄾᅉownArrow»ОeftArrow»࢚ightArrow»࿝pArrow;憑gma;䎣allCircle;战pf;쀀𝕊ɲᅭ\0\0ᅰt;戚areȀ;ISUᅻᅼᆉᆯ斡ntersection;抓uĀbpᆏᆞsetĀ;Eᆗᆘ抏qual;抑ersetĀ;Eᆨᆩ抐qual;抒nion;抔cr;쀀𝒮ar;拆ȀbcmpᇈᇛሉላĀ;sᇍᇎ拐etĀ;Eᇍᇕqual;抆ĀchᇠህeedsȀ;ESTᇭᇮᇴᇿ扻qual;檰lantEqual;扽ilde;承Tháྌ;我ƀ;esሒሓሣ拑rsetĀ;Eሜም抃qual;抇et»ሓրHRSacfhiorsሾቄ቉ቕ቞ቱቶኟዂወዑORN耻Þ䃞ADE;愢ĀHc቎ቒcy;䐋y;䐦Ābuቚቜ;䀉;䎤ƀaeyብቪቯron;䅤dil;䅢;䐢r;쀀𝔗Āeiቻ኉ǲኀ\0ኇefore;戴a;䎘Ācn኎ኘkSpace;쀀  Space;怉ldeȀ;EFTካኬኲኼ戼qual;扃ullEqual;扅ilde;扈pf;쀀𝕋ipleDot;惛Āctዖዛr;쀀𝒯rok;䅦ૡዷጎጚጦ\0ጬጱ\0\0\0\0\0ጸጽ፷ᎅ\0᏿ᐄᐊᐐĀcrዻጁute耻Ú䃚rĀ;oጇገ憟cir;楉rǣጓ\0጖y;䐎ve;䅬Āiyጞጣrc耻Û䃛;䐣blac;䅰r;쀀𝔘rave耻Ù䃙acr;䅪Ādiፁ፩erĀBPፈ፝Āarፍፐr;䁟acĀekፗፙ;揟et;掵arenthesis;揝onĀ;P፰፱拃lus;抎Āgp፻፿on;䅲f;쀀𝕌ЀADETadps᎕ᎮᎸᏄϨᏒᏗᏳrrowƀ;BDᅐᎠᎤar;椒ownArrow;懅ownArrow;憕quilibrium;楮eeĀ;AᏋᏌ报rrow;憥ownáϳerĀLRᏞᏨeftArrow;憖ightArrow;憗iĀ;lᏹᏺ䏒on;䎥ing;䅮cr;쀀𝒰ilde;䅨ml耻Ü䃜ҀDbcdefosvᐧᐬᐰᐳᐾᒅᒊᒐᒖash;披ar;櫫y;䐒ashĀ;lᐻᐼ抩;櫦Āerᑃᑅ;拁ƀbtyᑌᑐᑺar;怖Ā;iᑏᑕcalȀBLSTᑡᑥᑪᑴar;戣ine;䁼eparator;杘ilde;所ThinSpace;怊r;쀀𝔙pf;쀀𝕍cr;쀀𝒱dash;抪ʀcefosᒧᒬᒱᒶᒼirc;䅴dge;拀r;쀀𝔚pf;쀀𝕎cr;쀀𝒲Ȁfiosᓋᓐᓒᓘr;쀀𝔛;䎞pf;쀀𝕏cr;쀀𝒳ҀAIUacfosuᓱᓵᓹᓽᔄᔏᔔᔚᔠcy;䐯cy;䐇cy;䐮cute耻Ý䃝Āiyᔉᔍrc;䅶;䐫r;쀀𝔜pf;쀀𝕐cr;쀀𝒴ml;䅸ЀHacdefosᔵᔹᔿᕋᕏᕝᕠᕤcy;䐖cute;䅹Āayᕄᕉron;䅽;䐗ot;䅻ǲᕔ\0ᕛoWidtè૙a;䎖r;愨pf;愤cr;쀀𝒵௡ᖃᖊᖐ\0ᖰᖶᖿ\0\0\0\0ᗆᗛᗫᙟ᙭\0ᚕ᚛ᚲᚹ\0ᚾcute耻á䃡reve;䄃̀;Ediuyᖜᖝᖡᖣᖨᖭ戾;쀀∾̳;房rc耻â䃢te肻´̆;䐰lig耻æ䃦Ā;r²ᖺ;쀀𝔞rave耻à䃠ĀepᗊᗖĀfpᗏᗔsym;愵èᗓha;䎱ĀapᗟcĀclᗤᗧr;䄁g;樿ɤᗰ\0\0ᘊʀ;adsvᗺᗻᗿᘁᘇ戧nd;橕;橜lope;橘;橚΀;elmrszᘘᘙᘛᘞᘿᙏᙙ戠;榤e»ᘙsdĀ;aᘥᘦ戡ѡᘰᘲᘴᘶᘸᘺᘼᘾ;榨;榩;榪;榫;榬;榭;榮;榯tĀ;vᙅᙆ戟bĀ;dᙌᙍ抾;榝Āptᙔᙗh;戢»¹arr;捼Āgpᙣᙧon;䄅f;쀀𝕒΀;Eaeiop዁ᙻᙽᚂᚄᚇᚊ;橰cir;橯;扊d;手s;䀧roxĀ;e዁ᚒñᚃing耻å䃥ƀctyᚡᚦᚨr;쀀𝒶;䀪mpĀ;e዁ᚯñʈilde耻ã䃣ml耻ä䃤Āciᛂᛈoninôɲnt;樑ࠀNabcdefiklnoprsu᛭ᛱᜰ᜼ᝃᝈ᝸᝽០៦ᠹᡐᜍ᤽᥈ᥰot;櫭Ācrᛶ᜞kȀcepsᜀᜅᜍᜓong;扌psilon;䏶rime;怵imĀ;e᜚᜛戽q;拍Ŷᜢᜦee;抽edĀ;gᜬᜭ挅e»ᜭrkĀ;t፜᜷brk;掶Āoyᜁᝁ;䐱quo;怞ʀcmprtᝓ᝛ᝡᝤᝨausĀ;eĊĉptyv;榰séᜌnoõēƀahwᝯ᝱ᝳ;䎲;愶een;扬r;쀀𝔟g΀costuvwឍឝឳេ៕៛៞ƀaiuបពរðݠrc;旯p»፱ƀdptឤឨឭot;樀lus;樁imes;樂ɱឹ\0\0ើcup;樆ar;昅riangleĀdu៍្own;施p;斳plus;樄eåᑄåᒭarow;植ƀako៭ᠦᠵĀcn៲ᠣkƀlst៺֫᠂ozenge;槫riangleȀ;dlr᠒᠓᠘᠝斴own;斾eft;旂ight;斸k;搣Ʊᠫ\0ᠳƲᠯ\0ᠱ;斒;斑4;斓ck;斈ĀeoᠾᡍĀ;qᡃᡆ쀀=⃥uiv;쀀≡⃥t;挐Ȁptwxᡙᡞᡧᡬf;쀀𝕓Ā;tᏋᡣom»Ꮜtie;拈؀DHUVbdhmptuvᢅᢖᢪᢻᣗᣛᣬ᣿ᤅᤊᤐᤡȀLRlrᢎᢐᢒᢔ;敗;敔;敖;敓ʀ;DUduᢡᢢᢤᢦᢨ敐;敦;敩;敤;敧ȀLRlrᢳᢵᢷᢹ;敝;敚;敜;教΀;HLRhlrᣊᣋᣍᣏᣑᣓᣕ救;敬;散;敠;敫;敢;敟ox;槉ȀLRlrᣤᣦᣨᣪ;敕;敒;攐;攌ʀ;DUduڽ᣷᣹᣻᣽;敥;敨;攬;攴inus;抟lus;択imes;抠ȀLRlrᤙᤛᤝ᤟;敛;敘;攘;攔΀;HLRhlrᤰᤱᤳᤵᤷ᤻᤹攂;敪;敡;敞;攼;攤;攜Āevģ᥂bar耻¦䂦Ȁceioᥑᥖᥚᥠr;쀀𝒷mi;恏mĀ;e᜚᜜lƀ;bhᥨᥩᥫ䁜;槅sub;柈Ŭᥴ᥾lĀ;e᥹᥺怢t»᥺pƀ;Eeįᦅᦇ;檮Ā;qۜۛೡᦧ\0᧨ᨑᨕᨲ\0ᨷᩐ\0\0᪴\0\0᫁\0\0ᬡᬮ᭍᭒\0᯽\0ᰌƀcpr᦭ᦲ᧝ute;䄇̀;abcdsᦿᧀᧄ᧊᧕᧙戩nd;橄rcup;橉Āau᧏᧒p;橋p;橇ot;橀;쀀∩︀Āeo᧢᧥t;恁îړȀaeiu᧰᧻ᨁᨅǰ᧵\0᧸s;橍on;䄍dil耻ç䃧rc;䄉psĀ;sᨌᨍ橌m;橐ot;䄋ƀdmnᨛᨠᨦil肻¸ƭptyv;榲t脀¢;eᨭᨮ䂢räƲr;쀀𝔠ƀceiᨽᩀᩍy;䑇ckĀ;mᩇᩈ朓ark»ᩈ;䏇r΀;Ecefms᩟᩠ᩢᩫ᪤᪪᪮旋;槃ƀ;elᩩᩪᩭ䋆q;扗eɡᩴ\0\0᪈rrowĀlr᩼᪁eft;憺ight;憻ʀRSacd᪒᪔᪖᪚᪟»ཇ;擈st;抛irc;抚ash;抝nint;樐id;櫯cir;槂ubsĀ;u᪻᪼晣it»᪼ˬ᫇᫔᫺\0ᬊonĀ;eᫍᫎ䀺Ā;qÇÆɭ᫙\0\0᫢aĀ;t᫞᫟䀬;䁀ƀ;fl᫨᫩᫫戁îᅠeĀmx᫱᫶ent»᫩eóɍǧ᫾\0ᬇĀ;dኻᬂot;橭nôɆƀfryᬐᬔᬗ;쀀𝕔oäɔ脀©;sŕᬝr;愗Āaoᬥᬩrr;憵ss;朗Ācuᬲᬷr;쀀𝒸Ābpᬼ᭄Ā;eᭁᭂ櫏;櫑Ā;eᭉᭊ櫐;櫒dot;拯΀delprvw᭠᭬᭷ᮂᮬᯔ᯹arrĀlr᭨᭪;椸;椵ɰ᭲\0\0᭵r;拞c;拟arrĀ;p᭿ᮀ憶;椽̀;bcdosᮏᮐᮖᮡᮥᮨ截rcap;橈Āauᮛᮞp;橆p;橊ot;抍r;橅;쀀∪︀Ȁalrv᮵ᮿᯞᯣrrĀ;mᮼᮽ憷;椼yƀevwᯇᯔᯘqɰᯎ\0\0ᯒreã᭳uã᭵ee;拎edge;拏en耻¤䂤earrowĀlrᯮ᯳eft»ᮀight»ᮽeäᯝĀciᰁᰇoninôǷnt;戱lcty;挭ঀAHabcdefhijlorstuwz᰸᰻᰿ᱝᱩᱵᲊᲞᲬᲷ᳻᳿ᴍᵻᶑᶫᶻ᷆᷍rò΁ar;楥Ȁglrs᱈ᱍ᱒᱔ger;怠eth;愸òᄳhĀ;vᱚᱛ怐»ऊūᱡᱧarow;椏aã̕Āayᱮᱳron;䄏;䐴ƀ;ao̲ᱼᲄĀgrʿᲁr;懊tseq;橷ƀglmᲑᲔᲘ耻°䂰ta;䎴ptyv;榱ĀirᲣᲨsht;楿;쀀𝔡arĀlrᲳᲵ»ࣜ»သʀaegsv᳂͸᳖᳜᳠mƀ;oș᳊᳔ndĀ;ș᳑uit;晦amma;䏝in;拲ƀ;io᳧᳨᳸䃷de脀÷;o᳧ᳰntimes;拇nø᳷cy;䑒cɯᴆ\0\0ᴊrn;挞op;挍ʀlptuwᴘᴝᴢᵉᵕlar;䀤f;쀀𝕕ʀ;emps̋ᴭᴷᴽᵂqĀ;d͒ᴳot;扑inus;戸lus;戔quare;抡blebarwedgåúnƀadhᄮᵝᵧownarrowóᲃarpoonĀlrᵲᵶefôᲴighôᲶŢᵿᶅkaro÷གɯᶊ\0\0ᶎrn;挟op;挌ƀcotᶘᶣᶦĀryᶝᶡ;쀀𝒹;䑕l;槶rok;䄑Ādrᶰᶴot;拱iĀ;fᶺ᠖斿Āah᷀᷃ròЩaòྦangle;榦Āci᷒ᷕy;䑟grarr;柿ऀDacdefglmnopqrstuxḁḉḙḸոḼṉṡṾấắẽỡἪἷὄ὎὚ĀDoḆᴴoôᲉĀcsḎḔute耻é䃩ter;橮ȀaioyḢḧḱḶron;䄛rĀ;cḭḮ扖耻ê䃪lon;払;䑍ot;䄗ĀDrṁṅot;扒;쀀𝔢ƀ;rsṐṑṗ檚ave耻è䃨Ā;dṜṝ檖ot;檘Ȁ;ilsṪṫṲṴ檙nters;揧;愓Ā;dṹṺ檕ot;檗ƀapsẅẉẗcr;䄓tyƀ;svẒẓẕ戅et»ẓpĀ1;ẝẤĳạả;怄;怅怃ĀgsẪẬ;䅋p;怂ĀgpẴẸon;䄙f;쀀𝕖ƀalsỄỎỒrĀ;sỊị拕l;槣us;橱iƀ;lvỚớở䎵on»ớ;䏵ȀcsuvỪỳἋἣĀioữḱrc»Ḯɩỹ\0\0ỻíՈantĀglἂἆtr»ṝess»Ṻƀaeiἒ἖Ἒls;䀽st;扟vĀ;DȵἠD;橸parsl;槥ĀDaἯἳot;打rr;楱ƀcdiἾὁỸr;愯oô͒ĀahὉὋ;䎷耻ð䃰Āmrὓὗl耻ë䃫o;悬ƀcipὡὤὧl;䀡sôծĀeoὬὴctatioîՙnentialåչৡᾒ\0ᾞ\0ᾡᾧ\0\0ῆῌ\0ΐ\0ῦῪ \0 ⁚llingdotseñṄy;䑄male;晀ƀilrᾭᾳ῁lig;耀ﬃɩᾹ\0\0᾽g;耀ﬀig;耀ﬄ;쀀𝔣lig;耀ﬁlig;쀀fjƀaltῙ῜ῡt;晭ig;耀ﬂns;斱of;䆒ǰ΅\0ῳf;쀀𝕗ĀakֿῷĀ;vῼ´拔;櫙artint;樍Āao‌⁕Ācs‑⁒α‚‰‸⁅⁈\0⁐β•‥‧‪‬\0‮耻½䂽;慓耻¼䂼;慕;慙;慛Ƴ‴\0‶;慔;慖ʴ‾⁁\0\0⁃耻¾䂾;慗;慜5;慘ƶ⁌\0⁎;慚;慝8;慞l;恄wn;挢cr;쀀𝒻ࢀEabcdefgijlnorstv₂₉₟₥₰₴⃰⃵⃺⃿℃ℒℸ̗ℾ⅒↞Ā;lٍ₇;檌ƀcmpₐₕ₝ute;䇵maĀ;dₜ᳚䎳;檆reve;䄟Āiy₪₮rc;䄝;䐳ot;䄡Ȁ;lqsؾق₽⃉ƀ;qsؾٌ⃄lanô٥Ȁ;cdl٥⃒⃥⃕c;檩otĀ;o⃜⃝檀Ā;l⃢⃣檂;檄Ā;e⃪⃭쀀⋛︀s;檔r;쀀𝔤Ā;gٳ؛mel;愷cy;䑓Ȁ;Eajٚℌℎℐ;檒;檥;檤ȀEaesℛℝ℩ℴ;扩pĀ;p℣ℤ檊rox»ℤĀ;q℮ℯ檈Ā;q℮ℛim;拧pf;쀀𝕘Āci⅃ⅆr;愊mƀ;el٫ⅎ⅐;檎;檐茀>;cdlqr׮ⅠⅪⅮⅳⅹĀciⅥⅧ;檧r;橺ot;拗Par;榕uest;橼ʀadelsↄⅪ←ٖ↛ǰ↉\0↎proø₞r;楸qĀlqؿ↖lesó₈ií٫Āen↣↭rtneqq;쀀≩︀Å↪ԀAabcefkosy⇄⇇⇱⇵⇺∘∝∯≨≽ròΠȀilmr⇐⇔⇗⇛rsðᒄf»․ilôکĀdr⇠⇤cy;䑊ƀ;cwࣴ⇫⇯ir;楈;憭ar;意irc;䄥ƀalr∁∎∓rtsĀ;u∉∊晥it»∊lip;怦con;抹r;쀀𝔥sĀew∣∩arow;椥arow;椦ʀamopr∺∾≃≞≣rr;懿tht;戻kĀlr≉≓eftarrow;憩ightarrow;憪f;쀀𝕙bar;怕ƀclt≯≴≸r;쀀𝒽asè⇴rok;䄧Ābp⊂⊇ull;恃hen»ᱛૡ⊣\0⊪\0⊸⋅⋎\0⋕⋳\0\0⋸⌢⍧⍢⍿\0⎆⎪⎴cute耻í䃭ƀ;iyݱ⊰⊵rc耻î䃮;䐸Ācx⊼⊿y;䐵cl耻¡䂡ĀfrΟ⋉;쀀𝔦rave耻ì䃬Ȁ;inoܾ⋝⋩⋮Āin⋢⋦nt;樌t;戭fin;槜ta;愩lig;䄳ƀaop⋾⌚⌝ƀcgt⌅⌈⌗r;䄫ƀelpܟ⌏⌓inåގarôܠh;䄱f;抷ed;䆵ʀ;cfotӴ⌬⌱⌽⍁are;愅inĀ;t⌸⌹戞ie;槝doô⌙ʀ;celpݗ⍌⍐⍛⍡al;抺Āgr⍕⍙eróᕣã⍍arhk;樗rod;樼Ȁcgpt⍯⍲⍶⍻y;䑑on;䄯f;쀀𝕚a;䎹uest耻¿䂿Āci⎊⎏r;쀀𝒾nʀ;EdsvӴ⎛⎝⎡ӳ;拹ot;拵Ā;v⎦⎧拴;拳Ā;iݷ⎮lde;䄩ǫ⎸\0⎼cy;䑖l耻ï䃯̀cfmosu⏌⏗⏜⏡⏧⏵Āiy⏑⏕rc;䄵;䐹r;쀀𝔧ath;䈷pf;쀀𝕛ǣ⏬\0⏱r;쀀𝒿rcy;䑘kcy;䑔Ѐacfghjos␋␖␢␧␭␱␵␻ppaĀ;v␓␔䎺;䏰Āey␛␠dil;䄷;䐺r;쀀𝔨reen;䄸cy;䑅cy;䑜pf;쀀𝕜cr;쀀𝓀஀ABEHabcdefghjlmnoprstuv⑰⒁⒆⒍⒑┎┽╚▀♎♞♥♹♽⚚⚲⛘❝❨➋⟀⠁⠒ƀart⑷⑺⑼rò৆òΕail;椛arr;椎Ā;gঔ⒋;檋ar;楢ॣ⒥\0⒪\0⒱\0\0\0\0\0⒵Ⓔ\0ⓆⓈⓍ\0⓹ute;䄺mptyv;榴raîࡌbda;䎻gƀ;dlࢎⓁⓃ;榑åࢎ;檅uo耻«䂫rЀ;bfhlpst࢙ⓞⓦⓩ⓫⓮⓱⓵Ā;f࢝ⓣs;椟s;椝ë≒p;憫l;椹im;楳l;憢ƀ;ae⓿─┄檫il;椙Ā;s┉┊檭;쀀⪭︀ƀabr┕┙┝rr;椌rk;杲Āak┢┬cĀek┨┪;䁻;䁛Āes┱┳;榋lĀdu┹┻;榏;榍Ȁaeuy╆╋╖╘ron;䄾Ādi═╔il;䄼ìࢰâ┩;䐻Ȁcqrs╣╦╭╽a;椶uoĀ;rนᝆĀdu╲╷har;楧shar;楋h;憲ʀ;fgqs▋▌উ◳◿扤tʀahlrt▘▤▷◂◨rrowĀ;t࢙□aé⓶arpoonĀdu▯▴own»њp»०eftarrows;懇ightƀahs◍◖◞rrowĀ;sࣴࢧarpoonó྘quigarro÷⇰hreetimes;拋ƀ;qs▋ও◺lanôবʀ;cdgsব☊☍☝☨c;檨otĀ;o☔☕橿Ā;r☚☛檁;檃Ā;e☢☥쀀⋚︀s;檓ʀadegs☳☹☽♉♋pproøⓆot;拖qĀgq♃♅ôউgtò⒌ôছiíলƀilr♕࣡♚sht;楼;쀀𝔩Ā;Eজ♣;檑š♩♶rĀdu▲♮Ā;l॥♳;楪lk;斄cy;䑙ʀ;achtੈ⚈⚋⚑⚖rò◁orneòᴈard;楫ri;旺Āio⚟⚤dot;䅀ustĀ;a⚬⚭掰che»⚭ȀEaes⚻⚽⛉⛔;扨pĀ;p⛃⛄檉rox»⛄Ā;q⛎⛏檇Ā;q⛎⚻im;拦Ѐabnoptwz⛩⛴⛷✚✯❁❇❐Ānr⛮⛱g;柬r;懽rëࣁgƀlmr⛿✍✔eftĀar০✇ightá৲apsto;柼ightá৽parrowĀlr✥✩efô⓭ight;憬ƀafl✶✹✽r;榅;쀀𝕝us;樭imes;樴š❋❏st;戗áፎƀ;ef❗❘᠀旊nge»❘arĀ;l❤❥䀨t;榓ʀachmt❳❶❼➅➇ròࢨorneòᶌarĀ;d྘➃;業;怎ri;抿̀achiqt➘➝ੀ➢➮➻quo;怹r;쀀𝓁mƀ;egল➪➬;檍;檏Ābu┪➳oĀ;rฟ➹;怚rok;䅂萀<;cdhilqrࠫ⟒☹⟜⟠⟥⟪⟰Āci⟗⟙;檦r;橹reå◲mes;拉arr;楶uest;橻ĀPi⟵⟹ar;榖ƀ;ef⠀भ᠛旃rĀdu⠇⠍shar;楊har;楦Āen⠗⠡rtneqq;쀀≨︀Å⠞܀Dacdefhilnopsu⡀⡅⢂⢎⢓⢠⢥⢨⣚⣢⣤ઃ⣳⤂Dot;戺Ȁclpr⡎⡒⡣⡽r耻¯䂯Āet⡗⡙;時Ā;e⡞⡟朠se»⡟Ā;sျ⡨toȀ;dluျ⡳⡷⡻owîҌefôएðᏑker;斮Āoy⢇⢌mma;権;䐼ash;怔asuredangle»ᘦr;쀀𝔪o;愧ƀcdn⢯⢴⣉ro耻µ䂵Ȁ;acdᑤ⢽⣀⣄sôᚧir;櫰ot肻·Ƶusƀ;bd⣒ᤃ⣓戒Ā;uᴼ⣘;横ţ⣞⣡p;櫛ò−ðઁĀdp⣩⣮els;抧f;쀀𝕞Āct⣸⣽r;쀀𝓂pos»ᖝƀ;lm⤉⤊⤍䎼timap;抸ఀGLRVabcdefghijlmoprstuvw⥂⥓⥾⦉⦘⧚⧩⨕⨚⩘⩝⪃⪕⪤⪨⬄⬇⭄⭿⮮ⰴⱧⱼ⳩Āgt⥇⥋;쀀⋙̸Ā;v⥐௏쀀≫⃒ƀelt⥚⥲⥶ftĀar⥡⥧rrow;懍ightarrow;懎;쀀⋘̸Ā;v⥻ే쀀≪⃒ightarrow;懏ĀDd⦎⦓ash;抯ash;抮ʀbcnpt⦣⦧⦬⦱⧌la»˞ute;䅄g;쀀∠⃒ʀ;Eiop඄⦼⧀⧅⧈;쀀⩰̸d;쀀≋̸s;䅉roø඄urĀ;a⧓⧔普lĀ;s⧓ସǳ⧟\0⧣p肻\xA0ଷmpĀ;e௹ఀʀaeouy⧴⧾⨃⨐⨓ǰ⧹\0⧻;橃on;䅈dil;䅆ngĀ;dൾ⨊ot;쀀⩭̸p;橂;䐽ash;怓΀;Aadqsxஒ⨩⨭⨻⩁⩅⩐rr;懗rĀhr⨳⨶k;椤Ā;oᏲᏰot;쀀≐̸uiöୣĀei⩊⩎ar;椨í஘istĀ;s஠டr;쀀𝔫ȀEest௅⩦⩹⩼ƀ;qs஼⩭௡ƀ;qs஼௅⩴lanô௢ií௪Ā;rஶ⪁»ஷƀAap⪊⪍⪑rò⥱rr;憮ar;櫲ƀ;svྍ⪜ྌĀ;d⪡⪢拼;拺cy;䑚΀AEadest⪷⪺⪾⫂⫅⫶⫹rò⥦;쀀≦̸rr;憚r;急Ȁ;fqs఻⫎⫣⫯tĀar⫔⫙rro÷⫁ightarro÷⪐ƀ;qs఻⪺⫪lanôౕĀ;sౕ⫴»శiíౝĀ;rవ⫾iĀ;eచథiäඐĀpt⬌⬑f;쀀𝕟膀¬;in⬙⬚⬶䂬nȀ;Edvஉ⬤⬨⬮;쀀⋹̸ot;쀀⋵̸ǡஉ⬳⬵;拷;拶iĀ;vಸ⬼ǡಸ⭁⭃;拾;拽ƀaor⭋⭣⭩rȀ;ast୻⭕⭚⭟lleì୻l;쀀⫽⃥;쀀∂̸lint;樔ƀ;ceಒ⭰⭳uåಥĀ;cಘ⭸Ā;eಒ⭽ñಘȀAait⮈⮋⮝⮧rò⦈rrƀ;cw⮔⮕⮙憛;쀀⤳̸;쀀↝̸ghtarrow»⮕riĀ;eೋೖ΀chimpqu⮽⯍⯙⬄୸⯤⯯Ȁ;cerല⯆ഷ⯉uå൅;쀀𝓃ortɭ⬅\0\0⯖ará⭖mĀ;e൮⯟Ā;q൴൳suĀbp⯫⯭å೸åഋƀbcp⯶ⰑⰙȀ;Ees⯿ⰀഢⰄ抄;쀀⫅̸etĀ;eഛⰋqĀ;qണⰀcĀ;eലⰗñസȀ;EesⰢⰣൟⰧ抅;쀀⫆̸etĀ;e൘ⰮqĀ;qൠⰣȀgilrⰽⰿⱅⱇìௗlde耻ñ䃱çృiangleĀlrⱒⱜeftĀ;eచⱚñదightĀ;eೋⱥñ೗Ā;mⱬⱭ䎽ƀ;esⱴⱵⱹ䀣ro;愖p;怇ҀDHadgilrsⲏⲔⲙⲞⲣⲰⲶⳓⳣash;抭arr;椄p;쀀≍⃒ash;抬ĀetⲨⲬ;쀀≥⃒;쀀>⃒nfin;槞ƀAetⲽⳁⳅrr;椂;쀀≤⃒Ā;rⳊⳍ쀀<⃒ie;쀀⊴⃒ĀAtⳘⳜrr;椃rie;쀀⊵⃒im;쀀∼⃒ƀAan⳰⳴ⴂrr;懖rĀhr⳺⳽k;椣Ā;oᏧᏥear;椧ቓ᪕\0\0\0\0\0\0\0\0\0\0\0\0\0ⴭ\0ⴸⵈⵠⵥ⵲ⶄᬇ\0\0ⶍⶫ\0ⷈⷎ\0ⷜ⸙⸫⸾⹃Ācsⴱ᪗ute耻ó䃳ĀiyⴼⵅrĀ;c᪞ⵂ耻ô䃴;䐾ʀabios᪠ⵒⵗǈⵚlac;䅑v;樸old;榼lig;䅓Ācr⵩⵭ir;榿;쀀𝔬ͯ⵹\0\0⵼\0ⶂn;䋛ave耻ò䃲;槁Ābmⶈ෴ar;榵Ȁacitⶕ⶘ⶥⶨrò᪀Āir⶝ⶠr;榾oss;榻nå๒;槀ƀaeiⶱⶵⶹcr;䅍ga;䏉ƀcdnⷀⷅǍron;䎿;榶pf;쀀𝕠ƀaelⷔ⷗ǒr;榷rp;榹΀;adiosvⷪⷫⷮ⸈⸍⸐⸖戨rò᪆Ȁ;efmⷷⷸ⸂⸅橝rĀ;oⷾⷿ愴f»ⷿ耻ª䂪耻º䂺gof;抶r;橖lope;橗;橛ƀclo⸟⸡⸧ò⸁ash耻ø䃸l;折iŬⸯ⸴de耻õ䃵esĀ;aǛ⸺s;樶ml耻ö䃶bar;挽ૡ⹞\0⹽\0⺀⺝\0⺢⺹\0\0⻋ຜ\0⼓\0\0⼫⾼\0⿈rȀ;astЃ⹧⹲຅脀¶;l⹭⹮䂶leìЃɩ⹸\0\0⹻m;櫳;櫽y;䐿rʀcimpt⺋⺏⺓ᡥ⺗nt;䀥od;䀮il;怰enk;怱r;쀀𝔭ƀimo⺨⺰⺴Ā;v⺭⺮䏆;䏕maô੶ne;明ƀ;tv⺿⻀⻈䏀chfork»´;䏖Āau⻏⻟nĀck⻕⻝kĀ;h⇴⻛;愎ö⇴sҀ;abcdemst⻳⻴ᤈ⻹⻽⼄⼆⼊⼎䀫cir;樣ir;樢Āouᵀ⼂;樥;橲n肻±ຝim;樦wo;樧ƀipu⼙⼠⼥ntint;樕f;쀀𝕡nd耻£䂣Ԁ;Eaceinosu່⼿⽁⽄⽇⾁⾉⾒⽾⾶;檳p;檷uå໙Ā;c໎⽌̀;acens່⽙⽟⽦⽨⽾pproø⽃urlyeñ໙ñ໎ƀaes⽯⽶⽺pprox;檹qq;檵im;拨iíໟmeĀ;s⾈ຮ怲ƀEas⽸⾐⽺ð⽵ƀdfp໬⾙⾯ƀals⾠⾥⾪lar;挮ine;挒urf;挓Ā;t໻⾴ï໻rel;抰Āci⿀⿅r;쀀𝓅;䏈ncsp;怈̀fiopsu⿚⋢⿟⿥⿫⿱r;쀀𝔮pf;쀀𝕢rime;恗cr;쀀𝓆ƀaeo⿸〉〓tĀei⿾々rnionóڰnt;樖stĀ;e【】䀿ñἙô༔઀ABHabcdefhilmnoprstux぀けさすムㄎㄫㅇㅢㅲㆎ㈆㈕㈤㈩㉘㉮㉲㊐㊰㊷ƀartぇおがròႳòϝail;検aròᱥar;楤΀cdenqrtとふへみわゔヌĀeuねぱ;쀀∽̱te;䅕iãᅮmptyv;榳gȀ;del࿑らるろ;榒;榥å࿑uo耻»䂻rր;abcfhlpstw࿜ガクシスゼゾダッデナp;極Ā;f࿠ゴs;椠;椳s;椞ë≝ð✮l;楅im;楴l;憣;憝Āaiパフil;椚oĀ;nホボ戶aló༞ƀabrョリヮrò៥rk;杳ĀakンヽcĀekヹ・;䁽;䁝Āes㄂㄄;榌lĀduㄊㄌ;榎;榐Ȁaeuyㄗㄜㄧㄩron;䅙Ādiㄡㄥil;䅗ì࿲âヺ;䑀Ȁclqsㄴㄷㄽㅄa;椷dhar;楩uoĀ;rȎȍh;憳ƀacgㅎㅟངlȀ;ipsླྀㅘㅛႜnåႻarôྩt;断ƀilrㅩဣㅮsht;楽;쀀𝔯ĀaoㅷㆆrĀduㅽㅿ»ѻĀ;l႑ㆄ;楬Ā;vㆋㆌ䏁;䏱ƀgns㆕ㇹㇼht̀ahlrstㆤㆰ㇂㇘㇤㇮rrowĀ;t࿜ㆭaéトarpoonĀduㆻㆿowîㅾp»႒eftĀah㇊㇐rrowó࿪arpoonóՑightarrows;應quigarro÷ニhreetimes;拌g;䋚ingdotseñἲƀahm㈍㈐㈓rò࿪aòՑ;怏oustĀ;a㈞㈟掱che»㈟mid;櫮Ȁabpt㈲㈽㉀㉒Ānr㈷㈺g;柭r;懾rëဃƀafl㉇㉊㉎r;榆;쀀𝕣us;樮imes;樵Āap㉝㉧rĀ;g㉣㉤䀩t;榔olint;樒arò㇣Ȁachq㉻㊀Ⴜ㊅quo;怺r;쀀𝓇Ābu・㊊oĀ;rȔȓƀhir㊗㊛㊠reåㇸmes;拊iȀ;efl㊪ၙᠡ㊫方tri;槎luhar;楨;愞ൡ㋕㋛㋟㌬㌸㍱\0㍺㎤\0\0㏬㏰\0㐨㑈㑚㒭㒱㓊㓱\0㘖\0\0㘳cute;䅛quï➺Ԁ;Eaceinpsyᇭ㋳㋵㋿㌂㌋㌏㌟㌦㌩;檴ǰ㋺\0㋼;檸on;䅡uåᇾĀ;dᇳ㌇il;䅟rc;䅝ƀEas㌖㌘㌛;檶p;檺im;择olint;樓iíሄ;䑁otƀ;be㌴ᵇ㌵担;橦΀Aacmstx㍆㍊㍗㍛㍞㍣㍭rr;懘rĀhr㍐㍒ë∨Ā;oਸ਼਴t耻§䂧i;䀻war;椩mĀin㍩ðnuóñt;朶rĀ;o㍶⁕쀀𝔰Ȁacoy㎂㎆㎑㎠rp;景Āhy㎋㎏cy;䑉;䑈rtɭ㎙\0\0㎜iäᑤaraì⹯耻­䂭Āgm㎨㎴maƀ;fv㎱㎲㎲䏃;䏂Ѐ;deglnprካ㏅㏉㏎㏖㏞㏡㏦ot;橪Ā;q኱ኰĀ;E㏓㏔檞;檠Ā;E㏛㏜檝;檟e;扆lus;樤arr;楲aròᄽȀaeit㏸㐈㐏㐗Āls㏽㐄lsetmé㍪hp;樳parsl;槤Ādlᑣ㐔e;挣Ā;e㐜㐝檪Ā;s㐢㐣檬;쀀⪬︀ƀflp㐮㐳㑂tcy;䑌Ā;b㐸㐹䀯Ā;a㐾㐿槄r;挿f;쀀𝕤aĀdr㑍ЂesĀ;u㑔㑕晠it»㑕ƀcsu㑠㑹㒟Āau㑥㑯pĀ;sᆈ㑫;쀀⊓︀pĀ;sᆴ㑵;쀀⊔︀uĀbp㑿㒏ƀ;esᆗᆜ㒆etĀ;eᆗ㒍ñᆝƀ;esᆨᆭ㒖etĀ;eᆨ㒝ñᆮƀ;afᅻ㒦ְrť㒫ֱ»ᅼaròᅈȀcemt㒹㒾㓂㓅r;쀀𝓈tmîñiì㐕aræᆾĀar㓎㓕rĀ;f㓔ឿ昆Āan㓚㓭ightĀep㓣㓪psiloîỠhé⺯s»⡒ʀbcmnp㓻㕞ሉ㖋㖎Ҁ;Edemnprs㔎㔏㔑㔕㔞㔣㔬㔱㔶抂;櫅ot;檽Ā;dᇚ㔚ot;櫃ult;櫁ĀEe㔨㔪;櫋;把lus;檿arr;楹ƀeiu㔽㕒㕕tƀ;en㔎㕅㕋qĀ;qᇚ㔏eqĀ;q㔫㔨m;櫇Ābp㕚㕜;櫕;櫓c̀;acensᇭ㕬㕲㕹㕻㌦pproø㋺urlyeñᇾñᇳƀaes㖂㖈㌛pproø㌚qñ㌗g;晪ڀ123;Edehlmnps㖩㖬㖯ሜ㖲㖴㗀㗉㗕㗚㗟㗨㗭耻¹䂹耻²䂲耻³䂳;櫆Āos㖹㖼t;檾ub;櫘Ā;dሢ㗅ot;櫄sĀou㗏㗒l;柉b;櫗arr;楻ult;櫂ĀEe㗤㗦;櫌;抋lus;櫀ƀeiu㗴㘉㘌tƀ;enሜ㗼㘂qĀ;qሢ㖲eqĀ;q㗧㗤m;櫈Ābp㘑㘓;櫔;櫖ƀAan㘜㘠㘭rr;懙rĀhr㘦㘨ë∮Ā;oਫ਩war;椪lig耻ß䃟௡㙑㙝㙠ዎ㙳㙹\0㙾㛂\0\0\0\0\0㛛㜃\0㜉㝬\0\0\0㞇ɲ㙖\0\0㙛get;挖;䏄rë๟ƀaey㙦㙫㙰ron;䅥dil;䅣;䑂lrec;挕r;쀀𝔱Ȁeiko㚆㚝㚵㚼ǲ㚋\0㚑eĀ4fኄኁaƀ;sv㚘㚙㚛䎸ym;䏑Ācn㚢㚲kĀas㚨㚮pproø዁im»ኬsðኞĀas㚺㚮ð዁rn耻þ䃾Ǭ̟㛆⋧es膀×;bd㛏㛐㛘䃗Ā;aᤏ㛕r;樱;樰ƀeps㛡㛣㜀á⩍Ȁ;bcf҆㛬㛰㛴ot;挶ir;櫱Ā;o㛹㛼쀀𝕥rk;櫚á㍢rime;怴ƀaip㜏㜒㝤dåቈ΀adempst㜡㝍㝀㝑㝗㝜㝟ngleʀ;dlqr㜰㜱㜶㝀㝂斵own»ᶻeftĀ;e⠀㜾ñम;扜ightĀ;e㊪㝋ñၚot;旬inus;樺lus;樹b;槍ime;樻ezium;揢ƀcht㝲㝽㞁Āry㝷㝻;쀀𝓉;䑆cy;䑛rok;䅧Āio㞋㞎xô᝷headĀlr㞗㞠eftarro÷ࡏightarrow»ཝऀAHabcdfghlmoprstuw㟐㟓㟗㟤㟰㟼㠎㠜㠣㠴㡑㡝㡫㢩㣌㣒㣪㣶ròϭar;楣Ācr㟜㟢ute耻ú䃺òᅐrǣ㟪\0㟭y;䑞ve;䅭Āiy㟵㟺rc耻û䃻;䑃ƀabh㠃㠆㠋ròᎭlac;䅱aòᏃĀir㠓㠘sht;楾;쀀𝔲rave耻ù䃹š㠧㠱rĀlr㠬㠮»ॗ»ႃlk;斀Āct㠹㡍ɯ㠿\0\0㡊rnĀ;e㡅㡆挜r»㡆op;挏ri;旸Āal㡖㡚cr;䅫肻¨͉Āgp㡢㡦on;䅳f;쀀𝕦̀adhlsuᅋ㡸㡽፲㢑㢠ownáᎳarpoonĀlr㢈㢌efô㠭ighô㠯iƀ;hl㢙㢚㢜䏅»ᏺon»㢚parrows;懈ƀcit㢰㣄㣈ɯ㢶\0\0㣁rnĀ;e㢼㢽挝r»㢽op;挎ng;䅯ri;旹cr;쀀𝓊ƀdir㣙㣝㣢ot;拰lde;䅩iĀ;f㜰㣨»᠓Āam㣯㣲rò㢨l耻ü䃼angle;榧ހABDacdeflnoprsz㤜㤟㤩㤭㦵㦸㦽㧟㧤㧨㧳㧹㧽㨁㨠ròϷarĀ;v㤦㤧櫨;櫩asèϡĀnr㤲㤷grt;榜΀eknprst㓣㥆㥋㥒㥝㥤㦖appá␕othinçẖƀhir㓫⻈㥙opô⾵Ā;hᎷ㥢ïㆍĀiu㥩㥭gmá㎳Ābp㥲㦄setneqĀ;q㥽㦀쀀⊊︀;쀀⫋︀setneqĀ;q㦏㦒쀀⊋︀;쀀⫌︀Āhr㦛㦟etá㚜iangleĀlr㦪㦯eft»थight»ၑy;䐲ash»ံƀelr㧄㧒㧗ƀ;beⷪ㧋㧏ar;抻q;扚lip;拮Ābt㧜ᑨaòᑩr;쀀𝔳tré㦮suĀbp㧯㧱»ജ»൙pf;쀀𝕧roð໻tré㦴Ācu㨆㨋r;쀀𝓋Ābp㨐㨘nĀEe㦀㨖»㥾nĀEe㦒㨞»㦐igzag;榚΀cefoprs㨶㨻㩖㩛㩔㩡㩪irc;䅵Ādi㩀㩑Ābg㩅㩉ar;機eĀ;qᗺ㩏;扙erp;愘r;쀀𝔴pf;쀀𝕨Ā;eᑹ㩦atèᑹcr;쀀𝓌ૣណ㪇\0㪋\0㪐㪛\0\0㪝㪨㪫㪯\0\0㫃㫎\0㫘ៜ៟tré៑r;쀀𝔵ĀAa㪔㪗ròσrò৶;䎾ĀAa㪡㪤ròθrò৫að✓is;拻ƀdptឤ㪵㪾Āfl㪺ឩ;쀀𝕩imåឲĀAa㫇㫊ròώròਁĀcq㫒ីr;쀀𝓍Āpt៖㫜ré។Ѐacefiosu㫰㫽㬈㬌㬑㬕㬛㬡cĀuy㫶㫻te耻ý䃽;䑏Āiy㬂㬆rc;䅷;䑋n耻¥䂥r;쀀𝔶cy;䑗pf;쀀𝕪cr;쀀𝓎Ācm㬦㬩y;䑎l耻ÿ䃿Ԁacdefhiosw㭂㭈㭔㭘㭤㭩㭭㭴㭺㮀cute;䅺Āay㭍㭒ron;䅾;䐷ot;䅼Āet㭝㭡træᕟa;䎶r;쀀𝔷cy;䐶grarr;懝pf;쀀𝕫cr;쀀𝓏Ājn㮅㮇;怍j;怌`.split(``).map(e=>e.charCodeAt(0))),k_=new Map([[0,65533],[128,8364],[130,8218],[131,402],[132,8222],[133,8230],[134,8224],[135,8225],[136,710],[137,8240],[138,352],[139,8249],[140,338],[142,381],[145,8216],[146,8217],[147,8220],[148,8221],[149,8226],[150,8211],[151,8212],[152,732],[153,8482],[154,353],[155,8250],[156,339],[158,382],[159,376]]);String.fromCodePoint;function A_(e){return e>=55296&&e<=57343||e>1114111?65533:k_.get(e)??e}var j_;(function(e){e[e.NUM=35]=`NUM`,e[e.SEMI=59]=`SEMI`,e[e.EQUALS=61]=`EQUALS`,e[e.ZERO=48]=`ZERO`,e[e.NINE=57]=`NINE`,e[e.LOWER_A=97]=`LOWER_A`,e[e.LOWER_F=102]=`LOWER_F`,e[e.LOWER_X=120]=`LOWER_X`,e[e.LOWER_Z=122]=`LOWER_Z`,e[e.UPPER_A=65]=`UPPER_A`,e[e.UPPER_F=70]=`UPPER_F`,e[e.UPPER_Z=90]=`UPPER_Z`})(j_||={});var M_=32,N_;(function(e){e[e.VALUE_LENGTH=49152]=`VALUE_LENGTH`,e[e.BRANCH_LENGTH=16256]=`BRANCH_LENGTH`,e[e.JUMP_TABLE=127]=`JUMP_TABLE`})(N_||={});function P_(e){return e>=j_.ZERO&&e<=j_.NINE}function F_(e){return e>=j_.UPPER_A&&e<=j_.UPPER_F||e>=j_.LOWER_A&&e<=j_.LOWER_F}function I_(e){return e>=j_.UPPER_A&&e<=j_.UPPER_Z||e>=j_.LOWER_A&&e<=j_.LOWER_Z||P_(e)}function L_(e){return e===j_.EQUALS||I_(e)}var R_;(function(e){e[e.EntityStart=0]=`EntityStart`,e[e.NumericStart=1]=`NumericStart`,e[e.NumericDecimal=2]=`NumericDecimal`,e[e.NumericHex=3]=`NumericHex`,e[e.NamedEntity=4]=`NamedEntity`})(R_||={});var z_;(function(e){e[e.Legacy=0]=`Legacy`,e[e.Strict=1]=`Strict`,e[e.Attribute=2]=`Attribute`})(z_||={});var B_=class{constructor(e,t,n){this.decodeTree=e,this.emitCodePoint=t,this.errors=n,this.state=R_.EntityStart,this.consumed=1,this.result=0,this.treeIndex=0,this.excess=1,this.decodeMode=z_.Strict}startEntity(e){this.decodeMode=e,this.state=R_.EntityStart,this.result=0,this.treeIndex=0,this.excess=1,this.consumed=1}write(e,t){switch(this.state){case R_.EntityStart:return e.charCodeAt(t)===j_.NUM?(this.state=R_.NumericStart,this.consumed+=1,this.stateNumericStart(e,t+1)):(this.state=R_.NamedEntity,this.stateNamedEntity(e,t));case R_.NumericStart:return this.stateNumericStart(e,t);case R_.NumericDecimal:return this.stateNumericDecimal(e,t);case R_.NumericHex:return this.stateNumericHex(e,t);case R_.NamedEntity:return this.stateNamedEntity(e,t)}}stateNumericStart(e,t){return t>=e.length?-1:(e.charCodeAt(t)|M_)===j_.LOWER_X?(this.state=R_.NumericHex,this.consumed+=1,this.stateNumericHex(e,t+1)):(this.state=R_.NumericDecimal,this.stateNumericDecimal(e,t))}addToNumericResult(e,t,n,r){if(t!==n){let i=n-t;this.result=this.result*r**+i+Number.parseInt(e.substr(t,i),r),this.consumed+=i}}stateNumericHex(e,t){let n=t;for(;t<e.length;){let r=e.charCodeAt(t);if(P_(r)||F_(r))t+=1;else return this.addToNumericResult(e,n,t,16),this.emitNumericEntity(r,3)}return this.addToNumericResult(e,n,t,16),-1}stateNumericDecimal(e,t){let n=t;for(;t<e.length;){let r=e.charCodeAt(t);if(P_(r))t+=1;else return this.addToNumericResult(e,n,t,10),this.emitNumericEntity(r,2)}return this.addToNumericResult(e,n,t,10),-1}emitNumericEntity(e,t){var n;if(this.consumed<=t)return(n=this.errors)==null||n.absenceOfDigitsInNumericCharacterReference(this.consumed),0;if(e===j_.SEMI)this.consumed+=1;else if(this.decodeMode===z_.Strict)return 0;return this.emitCodePoint(A_(this.result),this.consumed),this.errors&&(e!==j_.SEMI&&this.errors.missingSemicolonAfterCharacterReference(),this.errors.validateNumericCharacterReference(this.result)),this.consumed}stateNamedEntity(e,t){let{decodeTree:n}=this,r=n[this.treeIndex],i=(r&N_.VALUE_LENGTH)>>14;for(;t<e.length;t++,this.excess++){let a=e.charCodeAt(t);if(this.treeIndex=V_(n,r,this.treeIndex+Math.max(1,i),a),this.treeIndex<0)return this.result===0||this.decodeMode===z_.Attribute&&(i===0||L_(a))?0:this.emitNotTerminatedNamedEntity();if(r=n[this.treeIndex],i=(r&N_.VALUE_LENGTH)>>14,i!==0){if(a===j_.SEMI)return this.emitNamedEntityData(this.treeIndex,i,this.consumed+this.excess);this.decodeMode!==z_.Strict&&(this.result=this.treeIndex,this.consumed+=this.excess,this.excess=0)}}return-1}emitNotTerminatedNamedEntity(){var e;let{result:t,decodeTree:n}=this,r=(n[t]&N_.VALUE_LENGTH)>>14;return this.emitNamedEntityData(t,r,this.consumed),(e=this.errors)==null||e.missingSemicolonAfterCharacterReference(),this.consumed}emitNamedEntityData(e,t,n){let{decodeTree:r}=this;return this.emitCodePoint(t===1?r[e]&~N_.VALUE_LENGTH:r[e+1],n),t===3&&this.emitCodePoint(r[e+2],n),n}end(){var e;switch(this.state){case R_.NamedEntity:return this.result!==0&&(this.decodeMode!==z_.Attribute||this.result===this.treeIndex)?this.emitNotTerminatedNamedEntity():0;case R_.NumericDecimal:return this.emitNumericEntity(0,2);case R_.NumericHex:return this.emitNumericEntity(0,3);case R_.NumericStart:return(e=this.errors)==null||e.absenceOfDigitsInNumericCharacterReference(this.consumed),0;case R_.EntityStart:return 0}}};function V_(e,t,n,r){let i=(t&N_.BRANCH_LENGTH)>>7,a=t&N_.JUMP_TABLE;if(i===0)return a!==0&&r===a?n:-1;if(a){let t=r-a;return t<0||t>=i?-1:e[n+t]-1}let o=n,s=o+i-1;for(;o<=s;){let t=o+s>>>1,n=e[t];if(n<r)o=t+1;else if(n>r)s=t-1;else return e[t+i]}return-1}var J;(function(e){e.HTML=`http://www.w3.org/1999/xhtml`,e.MATHML=`http://www.w3.org/1998/Math/MathML`,e.SVG=`http://www.w3.org/2000/svg`,e.XLINK=`http://www.w3.org/1999/xlink`,e.XML=`http://www.w3.org/XML/1998/namespace`,e.XMLNS=`http://www.w3.org/2000/xmlns/`})(J||={});var H_;(function(e){e.TYPE=`type`,e.ACTION=`action`,e.ENCODING=`encoding`,e.PROMPT=`prompt`,e.NAME=`name`,e.COLOR=`color`,e.FACE=`face`,e.SIZE=`size`})(H_||={});var U_;(function(e){e.NO_QUIRKS=`no-quirks`,e.QUIRKS=`quirks`,e.LIMITED_QUIRKS=`limited-quirks`})(U_||={});var Y;(function(e){e.A=`a`,e.ADDRESS=`address`,e.ANNOTATION_XML=`annotation-xml`,e.APPLET=`applet`,e.AREA=`area`,e.ARTICLE=`article`,e.ASIDE=`aside`,e.B=`b`,e.BASE=`base`,e.BASEFONT=`basefont`,e.BGSOUND=`bgsound`,e.BIG=`big`,e.BLOCKQUOTE=`blockquote`,e.BODY=`body`,e.BR=`br`,e.BUTTON=`button`,e.CAPTION=`caption`,e.CENTER=`center`,e.CODE=`code`,e.COL=`col`,e.COLGROUP=`colgroup`,e.DD=`dd`,e.DESC=`desc`,e.DETAILS=`details`,e.DIALOG=`dialog`,e.DIR=`dir`,e.DIV=`div`,e.DL=`dl`,e.DT=`dt`,e.EM=`em`,e.EMBED=`embed`,e.FIELDSET=`fieldset`,e.FIGCAPTION=`figcaption`,e.FIGURE=`figure`,e.FONT=`font`,e.FOOTER=`footer`,e.FOREIGN_OBJECT=`foreignObject`,e.FORM=`form`,e.FRAME=`frame`,e.FRAMESET=`frameset`,e.H1=`h1`,e.H2=`h2`,e.H3=`h3`,e.H4=`h4`,e.H5=`h5`,e.H6=`h6`,e.HEAD=`head`,e.HEADER=`header`,e.HGROUP=`hgroup`,e.HR=`hr`,e.HTML=`html`,e.I=`i`,e.IMG=`img`,e.IMAGE=`image`,e.INPUT=`input`,e.IFRAME=`iframe`,e.KEYGEN=`keygen`,e.LABEL=`label`,e.LI=`li`,e.LINK=`link`,e.LISTING=`listing`,e.MAIN=`main`,e.MALIGNMARK=`malignmark`,e.MARQUEE=`marquee`,e.MATH=`math`,e.MENU=`menu`,e.META=`meta`,e.MGLYPH=`mglyph`,e.MI=`mi`,e.MO=`mo`,e.MN=`mn`,e.MS=`ms`,e.MTEXT=`mtext`,e.NAV=`nav`,e.NOBR=`nobr`,e.NOFRAMES=`noframes`,e.NOEMBED=`noembed`,e.NOSCRIPT=`noscript`,e.OBJECT=`object`,e.OL=`ol`,e.OPTGROUP=`optgroup`,e.OPTION=`option`,e.P=`p`,e.PARAM=`param`,e.PLAINTEXT=`plaintext`,e.PRE=`pre`,e.RB=`rb`,e.RP=`rp`,e.RT=`rt`,e.RTC=`rtc`,e.RUBY=`ruby`,e.S=`s`,e.SCRIPT=`script`,e.SEARCH=`search`,e.SECTION=`section`,e.SELECT=`select`,e.SOURCE=`source`,e.SMALL=`small`,e.SPAN=`span`,e.STRIKE=`strike`,e.STRONG=`strong`,e.STYLE=`style`,e.SUB=`sub`,e.SUMMARY=`summary`,e.SUP=`sup`,e.TABLE=`table`,e.TBODY=`tbody`,e.TEMPLATE=`template`,e.TEXTAREA=`textarea`,e.TFOOT=`tfoot`,e.TD=`td`,e.TH=`th`,e.THEAD=`thead`,e.TITLE=`title`,e.TR=`tr`,e.TRACK=`track`,e.TT=`tt`,e.U=`u`,e.UL=`ul`,e.SVG=`svg`,e.VAR=`var`,e.WBR=`wbr`,e.XMP=`xmp`})(Y||={});var X;(function(e){e[e.UNKNOWN=0]=`UNKNOWN`,e[e.A=1]=`A`,e[e.ADDRESS=2]=`ADDRESS`,e[e.ANNOTATION_XML=3]=`ANNOTATION_XML`,e[e.APPLET=4]=`APPLET`,e[e.AREA=5]=`AREA`,e[e.ARTICLE=6]=`ARTICLE`,e[e.ASIDE=7]=`ASIDE`,e[e.B=8]=`B`,e[e.BASE=9]=`BASE`,e[e.BASEFONT=10]=`BASEFONT`,e[e.BGSOUND=11]=`BGSOUND`,e[e.BIG=12]=`BIG`,e[e.BLOCKQUOTE=13]=`BLOCKQUOTE`,e[e.BODY=14]=`BODY`,e[e.BR=15]=`BR`,e[e.BUTTON=16]=`BUTTON`,e[e.CAPTION=17]=`CAPTION`,e[e.CENTER=18]=`CENTER`,e[e.CODE=19]=`CODE`,e[e.COL=20]=`COL`,e[e.COLGROUP=21]=`COLGROUP`,e[e.DD=22]=`DD`,e[e.DESC=23]=`DESC`,e[e.DETAILS=24]=`DETAILS`,e[e.DIALOG=25]=`DIALOG`,e[e.DIR=26]=`DIR`,e[e.DIV=27]=`DIV`,e[e.DL=28]=`DL`,e[e.DT=29]=`DT`,e[e.EM=30]=`EM`,e[e.EMBED=31]=`EMBED`,e[e.FIELDSET=32]=`FIELDSET`,e[e.FIGCAPTION=33]=`FIGCAPTION`,e[e.FIGURE=34]=`FIGURE`,e[e.FONT=35]=`FONT`,e[e.FOOTER=36]=`FOOTER`,e[e.FOREIGN_OBJECT=37]=`FOREIGN_OBJECT`,e[e.FORM=38]=`FORM`,e[e.FRAME=39]=`FRAME`,e[e.FRAMESET=40]=`FRAMESET`,e[e.H1=41]=`H1`,e[e.H2=42]=`H2`,e[e.H3=43]=`H3`,e[e.H4=44]=`H4`,e[e.H5=45]=`H5`,e[e.H6=46]=`H6`,e[e.HEAD=47]=`HEAD`,e[e.HEADER=48]=`HEADER`,e[e.HGROUP=49]=`HGROUP`,e[e.HR=50]=`HR`,e[e.HTML=51]=`HTML`,e[e.I=52]=`I`,e[e.IMG=53]=`IMG`,e[e.IMAGE=54]=`IMAGE`,e[e.INPUT=55]=`INPUT`,e[e.IFRAME=56]=`IFRAME`,e[e.KEYGEN=57]=`KEYGEN`,e[e.LABEL=58]=`LABEL`,e[e.LI=59]=`LI`,e[e.LINK=60]=`LINK`,e[e.LISTING=61]=`LISTING`,e[e.MAIN=62]=`MAIN`,e[e.MALIGNMARK=63]=`MALIGNMARK`,e[e.MARQUEE=64]=`MARQUEE`,e[e.MATH=65]=`MATH`,e[e.MENU=66]=`MENU`,e[e.META=67]=`META`,e[e.MGLYPH=68]=`MGLYPH`,e[e.MI=69]=`MI`,e[e.MO=70]=`MO`,e[e.MN=71]=`MN`,e[e.MS=72]=`MS`,e[e.MTEXT=73]=`MTEXT`,e[e.NAV=74]=`NAV`,e[e.NOBR=75]=`NOBR`,e[e.NOFRAMES=76]=`NOFRAMES`,e[e.NOEMBED=77]=`NOEMBED`,e[e.NOSCRIPT=78]=`NOSCRIPT`,e[e.OBJECT=79]=`OBJECT`,e[e.OL=80]=`OL`,e[e.OPTGROUP=81]=`OPTGROUP`,e[e.OPTION=82]=`OPTION`,e[e.P=83]=`P`,e[e.PARAM=84]=`PARAM`,e[e.PLAINTEXT=85]=`PLAINTEXT`,e[e.PRE=86]=`PRE`,e[e.RB=87]=`RB`,e[e.RP=88]=`RP`,e[e.RT=89]=`RT`,e[e.RTC=90]=`RTC`,e[e.RUBY=91]=`RUBY`,e[e.S=92]=`S`,e[e.SCRIPT=93]=`SCRIPT`,e[e.SEARCH=94]=`SEARCH`,e[e.SECTION=95]=`SECTION`,e[e.SELECT=96]=`SELECT`,e[e.SOURCE=97]=`SOURCE`,e[e.SMALL=98]=`SMALL`,e[e.SPAN=99]=`SPAN`,e[e.STRIKE=100]=`STRIKE`,e[e.STRONG=101]=`STRONG`,e[e.STYLE=102]=`STYLE`,e[e.SUB=103]=`SUB`,e[e.SUMMARY=104]=`SUMMARY`,e[e.SUP=105]=`SUP`,e[e.TABLE=106]=`TABLE`,e[e.TBODY=107]=`TBODY`,e[e.TEMPLATE=108]=`TEMPLATE`,e[e.TEXTAREA=109]=`TEXTAREA`,e[e.TFOOT=110]=`TFOOT`,e[e.TD=111]=`TD`,e[e.TH=112]=`TH`,e[e.THEAD=113]=`THEAD`,e[e.TITLE=114]=`TITLE`,e[e.TR=115]=`TR`,e[e.TRACK=116]=`TRACK`,e[e.TT=117]=`TT`,e[e.U=118]=`U`,e[e.UL=119]=`UL`,e[e.SVG=120]=`SVG`,e[e.VAR=121]=`VAR`,e[e.WBR=122]=`WBR`,e[e.XMP=123]=`XMP`})(X||={});var W_=new Map([[Y.A,X.A],[Y.ADDRESS,X.ADDRESS],[Y.ANNOTATION_XML,X.ANNOTATION_XML],[Y.APPLET,X.APPLET],[Y.AREA,X.AREA],[Y.ARTICLE,X.ARTICLE],[Y.ASIDE,X.ASIDE],[Y.B,X.B],[Y.BASE,X.BASE],[Y.BASEFONT,X.BASEFONT],[Y.BGSOUND,X.BGSOUND],[Y.BIG,X.BIG],[Y.BLOCKQUOTE,X.BLOCKQUOTE],[Y.BODY,X.BODY],[Y.BR,X.BR],[Y.BUTTON,X.BUTTON],[Y.CAPTION,X.CAPTION],[Y.CENTER,X.CENTER],[Y.CODE,X.CODE],[Y.COL,X.COL],[Y.COLGROUP,X.COLGROUP],[Y.DD,X.DD],[Y.DESC,X.DESC],[Y.DETAILS,X.DETAILS],[Y.DIALOG,X.DIALOG],[Y.DIR,X.DIR],[Y.DIV,X.DIV],[Y.DL,X.DL],[Y.DT,X.DT],[Y.EM,X.EM],[Y.EMBED,X.EMBED],[Y.FIELDSET,X.FIELDSET],[Y.FIGCAPTION,X.FIGCAPTION],[Y.FIGURE,X.FIGURE],[Y.FONT,X.FONT],[Y.FOOTER,X.FOOTER],[Y.FOREIGN_OBJECT,X.FOREIGN_OBJECT],[Y.FORM,X.FORM],[Y.FRAME,X.FRAME],[Y.FRAMESET,X.FRAMESET],[Y.H1,X.H1],[Y.H2,X.H2],[Y.H3,X.H3],[Y.H4,X.H4],[Y.H5,X.H5],[Y.H6,X.H6],[Y.HEAD,X.HEAD],[Y.HEADER,X.HEADER],[Y.HGROUP,X.HGROUP],[Y.HR,X.HR],[Y.HTML,X.HTML],[Y.I,X.I],[Y.IMG,X.IMG],[Y.IMAGE,X.IMAGE],[Y.INPUT,X.INPUT],[Y.IFRAME,X.IFRAME],[Y.KEYGEN,X.KEYGEN],[Y.LABEL,X.LABEL],[Y.LI,X.LI],[Y.LINK,X.LINK],[Y.LISTING,X.LISTING],[Y.MAIN,X.MAIN],[Y.MALIGNMARK,X.MALIGNMARK],[Y.MARQUEE,X.MARQUEE],[Y.MATH,X.MATH],[Y.MENU,X.MENU],[Y.META,X.META],[Y.MGLYPH,X.MGLYPH],[Y.MI,X.MI],[Y.MO,X.MO],[Y.MN,X.MN],[Y.MS,X.MS],[Y.MTEXT,X.MTEXT],[Y.NAV,X.NAV],[Y.NOBR,X.NOBR],[Y.NOFRAMES,X.NOFRAMES],[Y.NOEMBED,X.NOEMBED],[Y.NOSCRIPT,X.NOSCRIPT],[Y.OBJECT,X.OBJECT],[Y.OL,X.OL],[Y.OPTGROUP,X.OPTGROUP],[Y.OPTION,X.OPTION],[Y.P,X.P],[Y.PARAM,X.PARAM],[Y.PLAINTEXT,X.PLAINTEXT],[Y.PRE,X.PRE],[Y.RB,X.RB],[Y.RP,X.RP],[Y.RT,X.RT],[Y.RTC,X.RTC],[Y.RUBY,X.RUBY],[Y.S,X.S],[Y.SCRIPT,X.SCRIPT],[Y.SEARCH,X.SEARCH],[Y.SECTION,X.SECTION],[Y.SELECT,X.SELECT],[Y.SOURCE,X.SOURCE],[Y.SMALL,X.SMALL],[Y.SPAN,X.SPAN],[Y.STRIKE,X.STRIKE],[Y.STRONG,X.STRONG],[Y.STYLE,X.STYLE],[Y.SUB,X.SUB],[Y.SUMMARY,X.SUMMARY],[Y.SUP,X.SUP],[Y.TABLE,X.TABLE],[Y.TBODY,X.TBODY],[Y.TEMPLATE,X.TEMPLATE],[Y.TEXTAREA,X.TEXTAREA],[Y.TFOOT,X.TFOOT],[Y.TD,X.TD],[Y.TH,X.TH],[Y.THEAD,X.THEAD],[Y.TITLE,X.TITLE],[Y.TR,X.TR],[Y.TRACK,X.TRACK],[Y.TT,X.TT],[Y.U,X.U],[Y.UL,X.UL],[Y.SVG,X.SVG],[Y.VAR,X.VAR],[Y.WBR,X.WBR],[Y.XMP,X.XMP]]);function G_(e){return W_.get(e)??X.UNKNOWN}var Z=X,K_={[J.HTML]:new Set([Z.ADDRESS,Z.APPLET,Z.AREA,Z.ARTICLE,Z.ASIDE,Z.BASE,Z.BASEFONT,Z.BGSOUND,Z.BLOCKQUOTE,Z.BODY,Z.BR,Z.BUTTON,Z.CAPTION,Z.CENTER,Z.COL,Z.COLGROUP,Z.DD,Z.DETAILS,Z.DIR,Z.DIV,Z.DL,Z.DT,Z.EMBED,Z.FIELDSET,Z.FIGCAPTION,Z.FIGURE,Z.FOOTER,Z.FORM,Z.FRAME,Z.FRAMESET,Z.H1,Z.H2,Z.H3,Z.H4,Z.H5,Z.H6,Z.HEAD,Z.HEADER,Z.HGROUP,Z.HR,Z.HTML,Z.IFRAME,Z.IMG,Z.INPUT,Z.LI,Z.LINK,Z.LISTING,Z.MAIN,Z.MARQUEE,Z.MENU,Z.META,Z.NAV,Z.NOEMBED,Z.NOFRAMES,Z.NOSCRIPT,Z.OBJECT,Z.OL,Z.P,Z.PARAM,Z.PLAINTEXT,Z.PRE,Z.SCRIPT,Z.SECTION,Z.SELECT,Z.SOURCE,Z.STYLE,Z.SUMMARY,Z.TABLE,Z.TBODY,Z.TD,Z.TEMPLATE,Z.TEXTAREA,Z.TFOOT,Z.TH,Z.THEAD,Z.TITLE,Z.TR,Z.TRACK,Z.UL,Z.WBR,Z.XMP]),[J.MATHML]:new Set([Z.MI,Z.MO,Z.MN,Z.MS,Z.MTEXT,Z.ANNOTATION_XML]),[J.SVG]:new Set([Z.TITLE,Z.FOREIGN_OBJECT,Z.DESC]),[J.XLINK]:new Set,[J.XML]:new Set,[J.XMLNS]:new Set},q_=new Set([Z.H1,Z.H2,Z.H3,Z.H4,Z.H5,Z.H6]);Y.STYLE,Y.SCRIPT,Y.XMP,Y.IFRAME,Y.NOEMBED,Y.NOFRAMES,Y.PLAINTEXT;var Q;(function(e){e[e.DATA=0]=`DATA`,e[e.RCDATA=1]=`RCDATA`,e[e.RAWTEXT=2]=`RAWTEXT`,e[e.SCRIPT_DATA=3]=`SCRIPT_DATA`,e[e.PLAINTEXT=4]=`PLAINTEXT`,e[e.TAG_OPEN=5]=`TAG_OPEN`,e[e.END_TAG_OPEN=6]=`END_TAG_OPEN`,e[e.TAG_NAME=7]=`TAG_NAME`,e[e.RCDATA_LESS_THAN_SIGN=8]=`RCDATA_LESS_THAN_SIGN`,e[e.RCDATA_END_TAG_OPEN=9]=`RCDATA_END_TAG_OPEN`,e[e.RCDATA_END_TAG_NAME=10]=`RCDATA_END_TAG_NAME`,e[e.RAWTEXT_LESS_THAN_SIGN=11]=`RAWTEXT_LESS_THAN_SIGN`,e[e.RAWTEXT_END_TAG_OPEN=12]=`RAWTEXT_END_TAG_OPEN`,e[e.RAWTEXT_END_TAG_NAME=13]=`RAWTEXT_END_TAG_NAME`,e[e.SCRIPT_DATA_LESS_THAN_SIGN=14]=`SCRIPT_DATA_LESS_THAN_SIGN`,e[e.SCRIPT_DATA_END_TAG_OPEN=15]=`SCRIPT_DATA_END_TAG_OPEN`,e[e.SCRIPT_DATA_END_TAG_NAME=16]=`SCRIPT_DATA_END_TAG_NAME`,e[e.SCRIPT_DATA_ESCAPE_START=17]=`SCRIPT_DATA_ESCAPE_START`,e[e.SCRIPT_DATA_ESCAPE_START_DASH=18]=`SCRIPT_DATA_ESCAPE_START_DASH`,e[e.SCRIPT_DATA_ESCAPED=19]=`SCRIPT_DATA_ESCAPED`,e[e.SCRIPT_DATA_ESCAPED_DASH=20]=`SCRIPT_DATA_ESCAPED_DASH`,e[e.SCRIPT_DATA_ESCAPED_DASH_DASH=21]=`SCRIPT_DATA_ESCAPED_DASH_DASH`,e[e.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN=22]=`SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN`,e[e.SCRIPT_DATA_ESCAPED_END_TAG_OPEN=23]=`SCRIPT_DATA_ESCAPED_END_TAG_OPEN`,e[e.SCRIPT_DATA_ESCAPED_END_TAG_NAME=24]=`SCRIPT_DATA_ESCAPED_END_TAG_NAME`,e[e.SCRIPT_DATA_DOUBLE_ESCAPE_START=25]=`SCRIPT_DATA_DOUBLE_ESCAPE_START`,e[e.SCRIPT_DATA_DOUBLE_ESCAPED=26]=`SCRIPT_DATA_DOUBLE_ESCAPED`,e[e.SCRIPT_DATA_DOUBLE_ESCAPED_DASH=27]=`SCRIPT_DATA_DOUBLE_ESCAPED_DASH`,e[e.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH=28]=`SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH`,e[e.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN=29]=`SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN`,e[e.SCRIPT_DATA_DOUBLE_ESCAPE_END=30]=`SCRIPT_DATA_DOUBLE_ESCAPE_END`,e[e.BEFORE_ATTRIBUTE_NAME=31]=`BEFORE_ATTRIBUTE_NAME`,e[e.ATTRIBUTE_NAME=32]=`ATTRIBUTE_NAME`,e[e.AFTER_ATTRIBUTE_NAME=33]=`AFTER_ATTRIBUTE_NAME`,e[e.BEFORE_ATTRIBUTE_VALUE=34]=`BEFORE_ATTRIBUTE_VALUE`,e[e.ATTRIBUTE_VALUE_DOUBLE_QUOTED=35]=`ATTRIBUTE_VALUE_DOUBLE_QUOTED`,e[e.ATTRIBUTE_VALUE_SINGLE_QUOTED=36]=`ATTRIBUTE_VALUE_SINGLE_QUOTED`,e[e.ATTRIBUTE_VALUE_UNQUOTED=37]=`ATTRIBUTE_VALUE_UNQUOTED`,e[e.AFTER_ATTRIBUTE_VALUE_QUOTED=38]=`AFTER_ATTRIBUTE_VALUE_QUOTED`,e[e.SELF_CLOSING_START_TAG=39]=`SELF_CLOSING_START_TAG`,e[e.BOGUS_COMMENT=40]=`BOGUS_COMMENT`,e[e.MARKUP_DECLARATION_OPEN=41]=`MARKUP_DECLARATION_OPEN`,e[e.COMMENT_START=42]=`COMMENT_START`,e[e.COMMENT_START_DASH=43]=`COMMENT_START_DASH`,e[e.COMMENT=44]=`COMMENT`,e[e.COMMENT_LESS_THAN_SIGN=45]=`COMMENT_LESS_THAN_SIGN`,e[e.COMMENT_LESS_THAN_SIGN_BANG=46]=`COMMENT_LESS_THAN_SIGN_BANG`,e[e.COMMENT_LESS_THAN_SIGN_BANG_DASH=47]=`COMMENT_LESS_THAN_SIGN_BANG_DASH`,e[e.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH=48]=`COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH`,e[e.COMMENT_END_DASH=49]=`COMMENT_END_DASH`,e[e.COMMENT_END=50]=`COMMENT_END`,e[e.COMMENT_END_BANG=51]=`COMMENT_END_BANG`,e[e.DOCTYPE=52]=`DOCTYPE`,e[e.BEFORE_DOCTYPE_NAME=53]=`BEFORE_DOCTYPE_NAME`,e[e.DOCTYPE_NAME=54]=`DOCTYPE_NAME`,e[e.AFTER_DOCTYPE_NAME=55]=`AFTER_DOCTYPE_NAME`,e[e.AFTER_DOCTYPE_PUBLIC_KEYWORD=56]=`AFTER_DOCTYPE_PUBLIC_KEYWORD`,e[e.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER=57]=`BEFORE_DOCTYPE_PUBLIC_IDENTIFIER`,e[e.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED=58]=`DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED`,e[e.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED=59]=`DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED`,e[e.AFTER_DOCTYPE_PUBLIC_IDENTIFIER=60]=`AFTER_DOCTYPE_PUBLIC_IDENTIFIER`,e[e.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS=61]=`BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS`,e[e.AFTER_DOCTYPE_SYSTEM_KEYWORD=62]=`AFTER_DOCTYPE_SYSTEM_KEYWORD`,e[e.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER=63]=`BEFORE_DOCTYPE_SYSTEM_IDENTIFIER`,e[e.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED=64]=`DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED`,e[e.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED=65]=`DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED`,e[e.AFTER_DOCTYPE_SYSTEM_IDENTIFIER=66]=`AFTER_DOCTYPE_SYSTEM_IDENTIFIER`,e[e.BOGUS_DOCTYPE=67]=`BOGUS_DOCTYPE`,e[e.CDATA_SECTION=68]=`CDATA_SECTION`,e[e.CDATA_SECTION_BRACKET=69]=`CDATA_SECTION_BRACKET`,e[e.CDATA_SECTION_END=70]=`CDATA_SECTION_END`,e[e.CHARACTER_REFERENCE=71]=`CHARACTER_REFERENCE`,e[e.AMBIGUOUS_AMPERSAND=72]=`AMBIGUOUS_AMPERSAND`})(Q||={});var J_={DATA:Q.DATA,RCDATA:Q.RCDATA,RAWTEXT:Q.RAWTEXT,SCRIPT_DATA:Q.SCRIPT_DATA,PLAINTEXT:Q.PLAINTEXT,CDATA_SECTION:Q.CDATA_SECTION};function Y_(e){return e>=G.DIGIT_0&&e<=G.DIGIT_9}function X_(e){return e>=G.LATIN_CAPITAL_A&&e<=G.LATIN_CAPITAL_Z}function Z_(e){return e>=G.LATIN_SMALL_A&&e<=G.LATIN_SMALL_Z}function Q_(e){return Z_(e)||X_(e)}function $_(e){return Q_(e)||Y_(e)}function ev(e){return e+32}function tv(e){return e===G.SPACE||e===G.LINE_FEED||e===G.TABULATION||e===G.FORM_FEED}function nv(e){return tv(e)||e===G.SOLIDUS||e===G.GREATER_THAN_SIGN}function rv(e){return e===G.NULL?K.nullCharacterReference:e>1114111?K.characterReferenceOutsideUnicodeRange:b_(e)?K.surrogateCharacterReference:w_(e)?K.noncharacterCharacterReference:C_(e)||e===G.CARRIAGE_RETURN?K.controlCharacterReference:null}var iv=class{constructor(e,t){this.options=e,this.handler=t,this.paused=!1,this.inLoop=!1,this.inForeignNode=!1,this.lastStartTagName=``,this.active=!1,this.state=Q.DATA,this.returnState=Q.DATA,this.entityStartPos=0,this.consumedAfterSnapshot=-1,this.currentCharacterToken=null,this.currentToken=null,this.currentAttr={name:``,value:``},this.preprocessor=new E_(t),this.currentLocation=this.getCurrentLocation(-1),this.entityDecoder=new B_(O_,(e,t)=>{this.preprocessor.pos=this.entityStartPos+t-1,this._flushCodePointConsumedAsCharacterReference(e)},t.onParseError?{missingSemicolonAfterCharacterReference:()=>{this._err(K.missingSemicolonAfterCharacterReference,1)},absenceOfDigitsInNumericCharacterReference:e=>{this._err(K.absenceOfDigitsInNumericCharacterReference,this.entityStartPos-this.preprocessor.pos+e)},validateNumericCharacterReference:e=>{let t=rv(e);t&&this._err(t,1)}}:void 0)}_err(e,t=0){var n,r;(r=(n=this.handler).onParseError)==null||r.call(n,this.preprocessor.getError(e,t))}getCurrentLocation(e){return this.options.sourceCodeLocationInfo?{startLine:this.preprocessor.line,startCol:this.preprocessor.col-e,startOffset:this.preprocessor.offset-e,endLine:-1,endCol:-1,endOffset:-1}:null}_runParsingLoop(){if(!this.inLoop){for(this.inLoop=!0;this.active&&!this.paused;){this.consumedAfterSnapshot=0;let e=this._consume();this._ensureHibernation()||this._callState(e)}this.inLoop=!1}}pause(){this.paused=!0}resume(e){if(!this.paused)throw Error(`Parser was already resumed`);this.paused=!1,!this.inLoop&&(this._runParsingLoop(),this.paused||e?.())}write(e,t,n){this.active=!0,this.preprocessor.write(e,t),this._runParsingLoop(),this.paused||n?.()}insertHtmlAtCurrentPos(e){this.active=!0,this.preprocessor.insertHtmlAtCurrentPos(e),this._runParsingLoop()}_ensureHibernation(){return this.preprocessor.endOfChunkHit?(this.preprocessor.retreat(this.consumedAfterSnapshot),this.consumedAfterSnapshot=0,this.active=!1,!0):!1}_consume(){return this.consumedAfterSnapshot++,this.preprocessor.advance()}_advanceBy(e){this.consumedAfterSnapshot+=e;for(let t=0;t<e;t++)this.preprocessor.advance()}_consumeSequenceIfMatch(e,t){return this.preprocessor.startsWith(e,t)?(this._advanceBy(e.length-1),!0):!1}_createStartTagToken(){this.currentToken={type:q.START_TAG,tagName:``,tagID:X.UNKNOWN,selfClosing:!1,ackSelfClosing:!1,attrs:[],location:this.getCurrentLocation(1)}}_createEndTagToken(){this.currentToken={type:q.END_TAG,tagName:``,tagID:X.UNKNOWN,selfClosing:!1,ackSelfClosing:!1,attrs:[],location:this.getCurrentLocation(2)}}_createCommentToken(e){this.currentToken={type:q.COMMENT,data:``,location:this.getCurrentLocation(e)}}_createDoctypeToken(e){this.currentToken={type:q.DOCTYPE,name:e,forceQuirks:!1,publicId:null,systemId:null,location:this.currentLocation}}_createCharacterToken(e,t){this.currentCharacterToken={type:e,chars:t,location:this.currentLocation}}_createAttr(e){this.currentAttr={name:e,value:``},this.currentLocation=this.getCurrentLocation(0)}_leaveAttrName(){var e;let t=this.currentToken;if(D_(t,this.currentAttr.name)===null){if(t.attrs.push(this.currentAttr),t.location&&this.currentLocation){let n=(e=t.location).attrs??(e.attrs=Object.create(null));n[this.currentAttr.name]=this.currentLocation,this._leaveAttrValue()}}else this._err(K.duplicateAttribute)}_leaveAttrValue(){this.currentLocation&&(this.currentLocation.endLine=this.preprocessor.line,this.currentLocation.endCol=this.preprocessor.col,this.currentLocation.endOffset=this.preprocessor.offset)}prepareToken(e){this._emitCurrentCharacterToken(e.location),this.currentToken=null,e.location&&(e.location.endLine=this.preprocessor.line,e.location.endCol=this.preprocessor.col+1,e.location.endOffset=this.preprocessor.offset+1),this.currentLocation=this.getCurrentLocation(-1)}emitCurrentTagToken(){let e=this.currentToken;this.prepareToken(e),e.tagID=G_(e.tagName),e.type===q.START_TAG?(this.lastStartTagName=e.tagName,this.handler.onStartTag(e)):(e.attrs.length>0&&this._err(K.endTagWithAttributes),e.selfClosing&&this._err(K.endTagWithTrailingSolidus),this.handler.onEndTag(e)),this.preprocessor.dropParsedChunk()}emitCurrentComment(e){this.prepareToken(e),this.handler.onComment(e),this.preprocessor.dropParsedChunk()}emitCurrentDoctype(e){this.prepareToken(e),this.handler.onDoctype(e),this.preprocessor.dropParsedChunk()}_emitCurrentCharacterToken(e){if(this.currentCharacterToken){switch(e&&this.currentCharacterToken.location&&(this.currentCharacterToken.location.endLine=e.startLine,this.currentCharacterToken.location.endCol=e.startCol,this.currentCharacterToken.location.endOffset=e.startOffset),this.currentCharacterToken.type){case q.CHARACTER:this.handler.onCharacter(this.currentCharacterToken);break;case q.NULL_CHARACTER:this.handler.onNullCharacter(this.currentCharacterToken);break;case q.WHITESPACE_CHARACTER:this.handler.onWhitespaceCharacter(this.currentCharacterToken)}this.currentCharacterToken=null}}_emitEOFToken(){let e=this.getCurrentLocation(0);e&&(e.endLine=e.startLine,e.endCol=e.startCol,e.endOffset=e.startOffset),this._emitCurrentCharacterToken(e),this.handler.onEof({type:q.EOF,location:e}),this.active=!1}_appendCharToCurrentCharacterToken(e,t){if(this.currentCharacterToken){if(this.currentCharacterToken.type===e){this.currentCharacterToken.chars+=t;return}this.currentLocation=this.getCurrentLocation(0),this._emitCurrentCharacterToken(this.currentLocation),this.preprocessor.dropParsedChunk()}this._createCharacterToken(e,t)}_emitCodePoint(e){let t=tv(e)?q.WHITESPACE_CHARACTER:e===G.NULL?q.NULL_CHARACTER:q.CHARACTER;this._appendCharToCurrentCharacterToken(t,String.fromCodePoint(e))}_emitChars(e){this._appendCharToCurrentCharacterToken(q.CHARACTER,e)}_startCharacterReference(){this.returnState=this.state,this.state=Q.CHARACTER_REFERENCE,this.entityStartPos=this.preprocessor.pos,this.entityDecoder.startEntity(this._isCharacterReferenceInAttribute()?z_.Attribute:z_.Legacy)}_isCharacterReferenceInAttribute(){return this.returnState===Q.ATTRIBUTE_VALUE_DOUBLE_QUOTED||this.returnState===Q.ATTRIBUTE_VALUE_SINGLE_QUOTED||this.returnState===Q.ATTRIBUTE_VALUE_UNQUOTED}_flushCodePointConsumedAsCharacterReference(e){this._isCharacterReferenceInAttribute()?this.currentAttr.value+=String.fromCodePoint(e):this._emitCodePoint(e)}_callState(e){switch(this.state){case Q.DATA:this._stateData(e);break;case Q.RCDATA:this._stateRcdata(e);break;case Q.RAWTEXT:this._stateRawtext(e);break;case Q.SCRIPT_DATA:this._stateScriptData(e);break;case Q.PLAINTEXT:this._statePlaintext(e);break;case Q.TAG_OPEN:this._stateTagOpen(e);break;case Q.END_TAG_OPEN:this._stateEndTagOpen(e);break;case Q.TAG_NAME:this._stateTagName(e);break;case Q.RCDATA_LESS_THAN_SIGN:this._stateRcdataLessThanSign(e);break;case Q.RCDATA_END_TAG_OPEN:this._stateRcdataEndTagOpen(e);break;case Q.RCDATA_END_TAG_NAME:this._stateRcdataEndTagName(e);break;case Q.RAWTEXT_LESS_THAN_SIGN:this._stateRawtextLessThanSign(e);break;case Q.RAWTEXT_END_TAG_OPEN:this._stateRawtextEndTagOpen(e);break;case Q.RAWTEXT_END_TAG_NAME:this._stateRawtextEndTagName(e);break;case Q.SCRIPT_DATA_LESS_THAN_SIGN:this._stateScriptDataLessThanSign(e);break;case Q.SCRIPT_DATA_END_TAG_OPEN:this._stateScriptDataEndTagOpen(e);break;case Q.SCRIPT_DATA_END_TAG_NAME:this._stateScriptDataEndTagName(e);break;case Q.SCRIPT_DATA_ESCAPE_START:this._stateScriptDataEscapeStart(e);break;case Q.SCRIPT_DATA_ESCAPE_START_DASH:this._stateScriptDataEscapeStartDash(e);break;case Q.SCRIPT_DATA_ESCAPED:this._stateScriptDataEscaped(e);break;case Q.SCRIPT_DATA_ESCAPED_DASH:this._stateScriptDataEscapedDash(e);break;case Q.SCRIPT_DATA_ESCAPED_DASH_DASH:this._stateScriptDataEscapedDashDash(e);break;case Q.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN:this._stateScriptDataEscapedLessThanSign(e);break;case Q.SCRIPT_DATA_ESCAPED_END_TAG_OPEN:this._stateScriptDataEscapedEndTagOpen(e);break;case Q.SCRIPT_DATA_ESCAPED_END_TAG_NAME:this._stateScriptDataEscapedEndTagName(e);break;case Q.SCRIPT_DATA_DOUBLE_ESCAPE_START:this._stateScriptDataDoubleEscapeStart(e);break;case Q.SCRIPT_DATA_DOUBLE_ESCAPED:this._stateScriptDataDoubleEscaped(e);break;case Q.SCRIPT_DATA_DOUBLE_ESCAPED_DASH:this._stateScriptDataDoubleEscapedDash(e);break;case Q.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH:this._stateScriptDataDoubleEscapedDashDash(e);break;case Q.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN:this._stateScriptDataDoubleEscapedLessThanSign(e);break;case Q.SCRIPT_DATA_DOUBLE_ESCAPE_END:this._stateScriptDataDoubleEscapeEnd(e);break;case Q.BEFORE_ATTRIBUTE_NAME:this._stateBeforeAttributeName(e);break;case Q.ATTRIBUTE_NAME:this._stateAttributeName(e);break;case Q.AFTER_ATTRIBUTE_NAME:this._stateAfterAttributeName(e);break;case Q.BEFORE_ATTRIBUTE_VALUE:this._stateBeforeAttributeValue(e);break;case Q.ATTRIBUTE_VALUE_DOUBLE_QUOTED:this._stateAttributeValueDoubleQuoted(e);break;case Q.ATTRIBUTE_VALUE_SINGLE_QUOTED:this._stateAttributeValueSingleQuoted(e);break;case Q.ATTRIBUTE_VALUE_UNQUOTED:this._stateAttributeValueUnquoted(e);break;case Q.AFTER_ATTRIBUTE_VALUE_QUOTED:this._stateAfterAttributeValueQuoted(e);break;case Q.SELF_CLOSING_START_TAG:this._stateSelfClosingStartTag(e);break;case Q.BOGUS_COMMENT:this._stateBogusComment(e);break;case Q.MARKUP_DECLARATION_OPEN:this._stateMarkupDeclarationOpen(e);break;case Q.COMMENT_START:this._stateCommentStart(e);break;case Q.COMMENT_START_DASH:this._stateCommentStartDash(e);break;case Q.COMMENT:this._stateComment(e);break;case Q.COMMENT_LESS_THAN_SIGN:this._stateCommentLessThanSign(e);break;case Q.COMMENT_LESS_THAN_SIGN_BANG:this._stateCommentLessThanSignBang(e);break;case Q.COMMENT_LESS_THAN_SIGN_BANG_DASH:this._stateCommentLessThanSignBangDash(e);break;case Q.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH:this._stateCommentLessThanSignBangDashDash(e);break;case Q.COMMENT_END_DASH:this._stateCommentEndDash(e);break;case Q.COMMENT_END:this._stateCommentEnd(e);break;case Q.COMMENT_END_BANG:this._stateCommentEndBang(e);break;case Q.DOCTYPE:this._stateDoctype(e);break;case Q.BEFORE_DOCTYPE_NAME:this._stateBeforeDoctypeName(e);break;case Q.DOCTYPE_NAME:this._stateDoctypeName(e);break;case Q.AFTER_DOCTYPE_NAME:this._stateAfterDoctypeName(e);break;case Q.AFTER_DOCTYPE_PUBLIC_KEYWORD:this._stateAfterDoctypePublicKeyword(e);break;case Q.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER:this._stateBeforeDoctypePublicIdentifier(e);break;case Q.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED:this._stateDoctypePublicIdentifierDoubleQuoted(e);break;case Q.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED:this._stateDoctypePublicIdentifierSingleQuoted(e);break;case Q.AFTER_DOCTYPE_PUBLIC_IDENTIFIER:this._stateAfterDoctypePublicIdentifier(e);break;case Q.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS:this._stateBetweenDoctypePublicAndSystemIdentifiers(e);break;case Q.AFTER_DOCTYPE_SYSTEM_KEYWORD:this._stateAfterDoctypeSystemKeyword(e);break;case Q.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER:this._stateBeforeDoctypeSystemIdentifier(e);break;case Q.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED:this._stateDoctypeSystemIdentifierDoubleQuoted(e);break;case Q.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED:this._stateDoctypeSystemIdentifierSingleQuoted(e);break;case Q.AFTER_DOCTYPE_SYSTEM_IDENTIFIER:this._stateAfterDoctypeSystemIdentifier(e);break;case Q.BOGUS_DOCTYPE:this._stateBogusDoctype(e);break;case Q.CDATA_SECTION:this._stateCdataSection(e);break;case Q.CDATA_SECTION_BRACKET:this._stateCdataSectionBracket(e);break;case Q.CDATA_SECTION_END:this._stateCdataSectionEnd(e);break;case Q.CHARACTER_REFERENCE:this._stateCharacterReference();break;case Q.AMBIGUOUS_AMPERSAND:this._stateAmbiguousAmpersand(e);break;default:throw Error(`Unknown state`)}}_stateData(e){switch(e){case G.LESS_THAN_SIGN:this.state=Q.TAG_OPEN;break;case G.AMPERSAND:this._startCharacterReference();break;case G.NULL:this._err(K.unexpectedNullCharacter),this._emitCodePoint(e);break;case G.EOF:this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateRcdata(e){switch(e){case G.AMPERSAND:this._startCharacterReference();break;case G.LESS_THAN_SIGN:this.state=Q.RCDATA_LESS_THAN_SIGN;break;case G.NULL:this._err(K.unexpectedNullCharacter),this._emitChars(`�`);break;case G.EOF:this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateRawtext(e){switch(e){case G.LESS_THAN_SIGN:this.state=Q.RAWTEXT_LESS_THAN_SIGN;break;case G.NULL:this._err(K.unexpectedNullCharacter),this._emitChars(`�`);break;case G.EOF:this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateScriptData(e){switch(e){case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_LESS_THAN_SIGN;break;case G.NULL:this._err(K.unexpectedNullCharacter),this._emitChars(`�`);break;case G.EOF:this._emitEOFToken();break;default:this._emitCodePoint(e)}}_statePlaintext(e){switch(e){case G.NULL:this._err(K.unexpectedNullCharacter),this._emitChars(`�`);break;case G.EOF:this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateTagOpen(e){if(Q_(e))this._createStartTagToken(),this.state=Q.TAG_NAME,this._stateTagName(e);else switch(e){case G.EXCLAMATION_MARK:this.state=Q.MARKUP_DECLARATION_OPEN;break;case G.SOLIDUS:this.state=Q.END_TAG_OPEN;break;case G.QUESTION_MARK:this._err(K.unexpectedQuestionMarkInsteadOfTagName),this._createCommentToken(1),this.state=Q.BOGUS_COMMENT,this._stateBogusComment(e);break;case G.EOF:this._err(K.eofBeforeTagName),this._emitChars(`<`),this._emitEOFToken();break;default:this._err(K.invalidFirstCharacterOfTagName),this._emitChars(`<`),this.state=Q.DATA,this._stateData(e)}}_stateEndTagOpen(e){if(Q_(e))this._createEndTagToken(),this.state=Q.TAG_NAME,this._stateTagName(e);else switch(e){case G.GREATER_THAN_SIGN:this._err(K.missingEndTagName),this.state=Q.DATA;break;case G.EOF:this._err(K.eofBeforeTagName),this._emitChars(`</`),this._emitEOFToken();break;default:this._err(K.invalidFirstCharacterOfTagName),this._createCommentToken(2),this.state=Q.BOGUS_COMMENT,this._stateBogusComment(e)}}_stateTagName(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this.state=Q.BEFORE_ATTRIBUTE_NAME;break;case G.SOLIDUS:this.state=Q.SELF_CLOSING_START_TAG;break;case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentTagToken();break;case G.NULL:this._err(K.unexpectedNullCharacter),t.tagName+=`�`;break;case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:t.tagName+=String.fromCodePoint(X_(e)?ev(e):e)}}_stateRcdataLessThanSign(e){e===G.SOLIDUS?this.state=Q.RCDATA_END_TAG_OPEN:(this._emitChars(`<`),this.state=Q.RCDATA,this._stateRcdata(e))}_stateRcdataEndTagOpen(e){Q_(e)?(this.state=Q.RCDATA_END_TAG_NAME,this._stateRcdataEndTagName(e)):(this._emitChars(`</`),this.state=Q.RCDATA,this._stateRcdata(e))}handleSpecialEndTag(e){if(!this.preprocessor.startsWith(this.lastStartTagName,!1))return!this._ensureHibernation();this._createEndTagToken();let t=this.currentToken;switch(t.tagName=this.lastStartTagName,this.preprocessor.peek(this.lastStartTagName.length)){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:return this._advanceBy(this.lastStartTagName.length),this.state=Q.BEFORE_ATTRIBUTE_NAME,!1;case G.SOLIDUS:return this._advanceBy(this.lastStartTagName.length),this.state=Q.SELF_CLOSING_START_TAG,!1;case G.GREATER_THAN_SIGN:return this._advanceBy(this.lastStartTagName.length),this.emitCurrentTagToken(),this.state=Q.DATA,!1;default:return!this._ensureHibernation()}}_stateRcdataEndTagName(e){this.handleSpecialEndTag(e)&&(this._emitChars(`</`),this.state=Q.RCDATA,this._stateRcdata(e))}_stateRawtextLessThanSign(e){e===G.SOLIDUS?this.state=Q.RAWTEXT_END_TAG_OPEN:(this._emitChars(`<`),this.state=Q.RAWTEXT,this._stateRawtext(e))}_stateRawtextEndTagOpen(e){Q_(e)?(this.state=Q.RAWTEXT_END_TAG_NAME,this._stateRawtextEndTagName(e)):(this._emitChars(`</`),this.state=Q.RAWTEXT,this._stateRawtext(e))}_stateRawtextEndTagName(e){this.handleSpecialEndTag(e)&&(this._emitChars(`</`),this.state=Q.RAWTEXT,this._stateRawtext(e))}_stateScriptDataLessThanSign(e){switch(e){case G.SOLIDUS:this.state=Q.SCRIPT_DATA_END_TAG_OPEN;break;case G.EXCLAMATION_MARK:this.state=Q.SCRIPT_DATA_ESCAPE_START,this._emitChars(`<!`);break;default:this._emitChars(`<`),this.state=Q.SCRIPT_DATA,this._stateScriptData(e)}}_stateScriptDataEndTagOpen(e){Q_(e)?(this.state=Q.SCRIPT_DATA_END_TAG_NAME,this._stateScriptDataEndTagName(e)):(this._emitChars(`</`),this.state=Q.SCRIPT_DATA,this._stateScriptData(e))}_stateScriptDataEndTagName(e){this.handleSpecialEndTag(e)&&(this._emitChars(`</`),this.state=Q.SCRIPT_DATA,this._stateScriptData(e))}_stateScriptDataEscapeStart(e){e===G.HYPHEN_MINUS?(this.state=Q.SCRIPT_DATA_ESCAPE_START_DASH,this._emitChars(`-`)):(this.state=Q.SCRIPT_DATA,this._stateScriptData(e))}_stateScriptDataEscapeStartDash(e){e===G.HYPHEN_MINUS?(this.state=Q.SCRIPT_DATA_ESCAPED_DASH_DASH,this._emitChars(`-`)):(this.state=Q.SCRIPT_DATA,this._stateScriptData(e))}_stateScriptDataEscaped(e){switch(e){case G.HYPHEN_MINUS:this.state=Q.SCRIPT_DATA_ESCAPED_DASH,this._emitChars(`-`);break;case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;break;case G.NULL:this._err(K.unexpectedNullCharacter),this._emitChars(`�`);break;case G.EOF:this._err(K.eofInScriptHtmlCommentLikeText),this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateScriptDataEscapedDash(e){switch(e){case G.HYPHEN_MINUS:this.state=Q.SCRIPT_DATA_ESCAPED_DASH_DASH,this._emitChars(`-`);break;case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;break;case G.NULL:this._err(K.unexpectedNullCharacter),this.state=Q.SCRIPT_DATA_ESCAPED,this._emitChars(`�`);break;case G.EOF:this._err(K.eofInScriptHtmlCommentLikeText),this._emitEOFToken();break;default:this.state=Q.SCRIPT_DATA_ESCAPED,this._emitCodePoint(e)}}_stateScriptDataEscapedDashDash(e){switch(e){case G.HYPHEN_MINUS:this._emitChars(`-`);break;case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_ESCAPED_LESS_THAN_SIGN;break;case G.GREATER_THAN_SIGN:this.state=Q.SCRIPT_DATA,this._emitChars(`>`);break;case G.NULL:this._err(K.unexpectedNullCharacter),this.state=Q.SCRIPT_DATA_ESCAPED,this._emitChars(`�`);break;case G.EOF:this._err(K.eofInScriptHtmlCommentLikeText),this._emitEOFToken();break;default:this.state=Q.SCRIPT_DATA_ESCAPED,this._emitCodePoint(e)}}_stateScriptDataEscapedLessThanSign(e){e===G.SOLIDUS?this.state=Q.SCRIPT_DATA_ESCAPED_END_TAG_OPEN:Q_(e)?(this._emitChars(`<`),this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPE_START,this._stateScriptDataDoubleEscapeStart(e)):(this._emitChars(`<`),this.state=Q.SCRIPT_DATA_ESCAPED,this._stateScriptDataEscaped(e))}_stateScriptDataEscapedEndTagOpen(e){Q_(e)?(this.state=Q.SCRIPT_DATA_ESCAPED_END_TAG_NAME,this._stateScriptDataEscapedEndTagName(e)):(this._emitChars(`</`),this.state=Q.SCRIPT_DATA_ESCAPED,this._stateScriptDataEscaped(e))}_stateScriptDataEscapedEndTagName(e){this.handleSpecialEndTag(e)&&(this._emitChars(`</`),this.state=Q.SCRIPT_DATA_ESCAPED,this._stateScriptDataEscaped(e))}_stateScriptDataDoubleEscapeStart(e){if(this.preprocessor.startsWith(y_.SCRIPT,!1)&&nv(this.preprocessor.peek(y_.SCRIPT.length))){this._emitCodePoint(e);for(let e=0;e<y_.SCRIPT.length;e++)this._emitCodePoint(this._consume());this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED}else this._ensureHibernation()||(this.state=Q.SCRIPT_DATA_ESCAPED,this._stateScriptDataEscaped(e))}_stateScriptDataDoubleEscaped(e){switch(e){case G.HYPHEN_MINUS:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED_DASH,this._emitChars(`-`);break;case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN,this._emitChars(`<`);break;case G.NULL:this._err(K.unexpectedNullCharacter),this._emitChars(`�`);break;case G.EOF:this._err(K.eofInScriptHtmlCommentLikeText),this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateScriptDataDoubleEscapedDash(e){switch(e){case G.HYPHEN_MINUS:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED_DASH_DASH,this._emitChars(`-`);break;case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN,this._emitChars(`<`);break;case G.NULL:this._err(K.unexpectedNullCharacter),this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED,this._emitChars(`�`);break;case G.EOF:this._err(K.eofInScriptHtmlCommentLikeText),this._emitEOFToken();break;default:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED,this._emitCodePoint(e)}}_stateScriptDataDoubleEscapedDashDash(e){switch(e){case G.HYPHEN_MINUS:this._emitChars(`-`);break;case G.LESS_THAN_SIGN:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED_LESS_THAN_SIGN,this._emitChars(`<`);break;case G.GREATER_THAN_SIGN:this.state=Q.SCRIPT_DATA,this._emitChars(`>`);break;case G.NULL:this._err(K.unexpectedNullCharacter),this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED,this._emitChars(`�`);break;case G.EOF:this._err(K.eofInScriptHtmlCommentLikeText),this._emitEOFToken();break;default:this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED,this._emitCodePoint(e)}}_stateScriptDataDoubleEscapedLessThanSign(e){e===G.SOLIDUS?(this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPE_END,this._emitChars(`/`)):(this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED,this._stateScriptDataDoubleEscaped(e))}_stateScriptDataDoubleEscapeEnd(e){if(this.preprocessor.startsWith(y_.SCRIPT,!1)&&nv(this.preprocessor.peek(y_.SCRIPT.length))){this._emitCodePoint(e);for(let e=0;e<y_.SCRIPT.length;e++)this._emitCodePoint(this._consume());this.state=Q.SCRIPT_DATA_ESCAPED}else this._ensureHibernation()||(this.state=Q.SCRIPT_DATA_DOUBLE_ESCAPED,this._stateScriptDataDoubleEscaped(e))}_stateBeforeAttributeName(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.SOLIDUS:case G.GREATER_THAN_SIGN:case G.EOF:this.state=Q.AFTER_ATTRIBUTE_NAME,this._stateAfterAttributeName(e);break;case G.EQUALS_SIGN:this._err(K.unexpectedEqualsSignBeforeAttributeName),this._createAttr(`=`),this.state=Q.ATTRIBUTE_NAME;break;default:this._createAttr(``),this.state=Q.ATTRIBUTE_NAME,this._stateAttributeName(e)}}_stateAttributeName(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:case G.SOLIDUS:case G.GREATER_THAN_SIGN:case G.EOF:this._leaveAttrName(),this.state=Q.AFTER_ATTRIBUTE_NAME,this._stateAfterAttributeName(e);break;case G.EQUALS_SIGN:this._leaveAttrName(),this.state=Q.BEFORE_ATTRIBUTE_VALUE;break;case G.QUOTATION_MARK:case G.APOSTROPHE:case G.LESS_THAN_SIGN:this._err(K.unexpectedCharacterInAttributeName),this.currentAttr.name+=String.fromCodePoint(e);break;case G.NULL:this._err(K.unexpectedNullCharacter),this.currentAttr.name+=`�`;break;default:this.currentAttr.name+=String.fromCodePoint(X_(e)?ev(e):e)}}_stateAfterAttributeName(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.SOLIDUS:this.state=Q.SELF_CLOSING_START_TAG;break;case G.EQUALS_SIGN:this.state=Q.BEFORE_ATTRIBUTE_VALUE;break;case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentTagToken();break;case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:this._createAttr(``),this.state=Q.ATTRIBUTE_NAME,this._stateAttributeName(e)}}_stateBeforeAttributeValue(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.QUOTATION_MARK:this.state=Q.ATTRIBUTE_VALUE_DOUBLE_QUOTED;break;case G.APOSTROPHE:this.state=Q.ATTRIBUTE_VALUE_SINGLE_QUOTED;break;case G.GREATER_THAN_SIGN:this._err(K.missingAttributeValue),this.state=Q.DATA,this.emitCurrentTagToken();break;default:this.state=Q.ATTRIBUTE_VALUE_UNQUOTED,this._stateAttributeValueUnquoted(e)}}_stateAttributeValueDoubleQuoted(e){switch(e){case G.QUOTATION_MARK:this.state=Q.AFTER_ATTRIBUTE_VALUE_QUOTED;break;case G.AMPERSAND:this._startCharacterReference();break;case G.NULL:this._err(K.unexpectedNullCharacter),this.currentAttr.value+=`�`;break;case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:this.currentAttr.value+=String.fromCodePoint(e)}}_stateAttributeValueSingleQuoted(e){switch(e){case G.APOSTROPHE:this.state=Q.AFTER_ATTRIBUTE_VALUE_QUOTED;break;case G.AMPERSAND:this._startCharacterReference();break;case G.NULL:this._err(K.unexpectedNullCharacter),this.currentAttr.value+=`�`;break;case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:this.currentAttr.value+=String.fromCodePoint(e)}}_stateAttributeValueUnquoted(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this._leaveAttrValue(),this.state=Q.BEFORE_ATTRIBUTE_NAME;break;case G.AMPERSAND:this._startCharacterReference();break;case G.GREATER_THAN_SIGN:this._leaveAttrValue(),this.state=Q.DATA,this.emitCurrentTagToken();break;case G.NULL:this._err(K.unexpectedNullCharacter),this.currentAttr.value+=`�`;break;case G.QUOTATION_MARK:case G.APOSTROPHE:case G.LESS_THAN_SIGN:case G.EQUALS_SIGN:case G.GRAVE_ACCENT:this._err(K.unexpectedCharacterInUnquotedAttributeValue),this.currentAttr.value+=String.fromCodePoint(e);break;case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:this.currentAttr.value+=String.fromCodePoint(e)}}_stateAfterAttributeValueQuoted(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this._leaveAttrValue(),this.state=Q.BEFORE_ATTRIBUTE_NAME;break;case G.SOLIDUS:this._leaveAttrValue(),this.state=Q.SELF_CLOSING_START_TAG;break;case G.GREATER_THAN_SIGN:this._leaveAttrValue(),this.state=Q.DATA,this.emitCurrentTagToken();break;case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:this._err(K.missingWhitespaceBetweenAttributes),this.state=Q.BEFORE_ATTRIBUTE_NAME,this._stateBeforeAttributeName(e)}}_stateSelfClosingStartTag(e){switch(e){case G.GREATER_THAN_SIGN:{let e=this.currentToken;e.selfClosing=!0,this.state=Q.DATA,this.emitCurrentTagToken();break}case G.EOF:this._err(K.eofInTag),this._emitEOFToken();break;default:this._err(K.unexpectedSolidusInTag),this.state=Q.BEFORE_ATTRIBUTE_NAME,this._stateBeforeAttributeName(e)}}_stateBogusComment(e){let t=this.currentToken;switch(e){case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentComment(t);break;case G.EOF:this.emitCurrentComment(t),this._emitEOFToken();break;case G.NULL:this._err(K.unexpectedNullCharacter),t.data+=`�`;break;default:t.data+=String.fromCodePoint(e)}}_stateMarkupDeclarationOpen(e){this._consumeSequenceIfMatch(y_.DASH_DASH,!0)?(this._createCommentToken(y_.DASH_DASH.length+1),this.state=Q.COMMENT_START):this._consumeSequenceIfMatch(y_.DOCTYPE,!1)?(this.currentLocation=this.getCurrentLocation(y_.DOCTYPE.length+1),this.state=Q.DOCTYPE):this._consumeSequenceIfMatch(y_.CDATA_START,!0)?this.inForeignNode?this.state=Q.CDATA_SECTION:(this._err(K.cdataInHtmlContent),this._createCommentToken(y_.CDATA_START.length+1),this.currentToken.data=`[CDATA[`,this.state=Q.BOGUS_COMMENT):this._ensureHibernation()||(this._err(K.incorrectlyOpenedComment),this._createCommentToken(2),this.state=Q.BOGUS_COMMENT,this._stateBogusComment(e))}_stateCommentStart(e){switch(e){case G.HYPHEN_MINUS:this.state=Q.COMMENT_START_DASH;break;case G.GREATER_THAN_SIGN:{this._err(K.abruptClosingOfEmptyComment),this.state=Q.DATA;let e=this.currentToken;this.emitCurrentComment(e);break}default:this.state=Q.COMMENT,this._stateComment(e)}}_stateCommentStartDash(e){let t=this.currentToken;switch(e){case G.HYPHEN_MINUS:this.state=Q.COMMENT_END;break;case G.GREATER_THAN_SIGN:this._err(K.abruptClosingOfEmptyComment),this.state=Q.DATA,this.emitCurrentComment(t);break;case G.EOF:this._err(K.eofInComment),this.emitCurrentComment(t),this._emitEOFToken();break;default:t.data+=`-`,this.state=Q.COMMENT,this._stateComment(e)}}_stateComment(e){let t=this.currentToken;switch(e){case G.HYPHEN_MINUS:this.state=Q.COMMENT_END_DASH;break;case G.LESS_THAN_SIGN:t.data+=`<`,this.state=Q.COMMENT_LESS_THAN_SIGN;break;case G.NULL:this._err(K.unexpectedNullCharacter),t.data+=`�`;break;case G.EOF:this._err(K.eofInComment),this.emitCurrentComment(t),this._emitEOFToken();break;default:t.data+=String.fromCodePoint(e)}}_stateCommentLessThanSign(e){let t=this.currentToken;switch(e){case G.EXCLAMATION_MARK:t.data+=`!`,this.state=Q.COMMENT_LESS_THAN_SIGN_BANG;break;case G.LESS_THAN_SIGN:t.data+=`<`;break;default:this.state=Q.COMMENT,this._stateComment(e)}}_stateCommentLessThanSignBang(e){e===G.HYPHEN_MINUS?this.state=Q.COMMENT_LESS_THAN_SIGN_BANG_DASH:(this.state=Q.COMMENT,this._stateComment(e))}_stateCommentLessThanSignBangDash(e){e===G.HYPHEN_MINUS?this.state=Q.COMMENT_LESS_THAN_SIGN_BANG_DASH_DASH:(this.state=Q.COMMENT_END_DASH,this._stateCommentEndDash(e))}_stateCommentLessThanSignBangDashDash(e){e!==G.GREATER_THAN_SIGN&&e!==G.EOF&&this._err(K.nestedComment),this.state=Q.COMMENT_END,this._stateCommentEnd(e)}_stateCommentEndDash(e){let t=this.currentToken;switch(e){case G.HYPHEN_MINUS:this.state=Q.COMMENT_END;break;case G.EOF:this._err(K.eofInComment),this.emitCurrentComment(t),this._emitEOFToken();break;default:t.data+=`-`,this.state=Q.COMMENT,this._stateComment(e)}}_stateCommentEnd(e){let t=this.currentToken;switch(e){case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentComment(t);break;case G.EXCLAMATION_MARK:this.state=Q.COMMENT_END_BANG;break;case G.HYPHEN_MINUS:t.data+=`-`;break;case G.EOF:this._err(K.eofInComment),this.emitCurrentComment(t),this._emitEOFToken();break;default:t.data+=`--`,this.state=Q.COMMENT,this._stateComment(e)}}_stateCommentEndBang(e){let t=this.currentToken;switch(e){case G.HYPHEN_MINUS:t.data+=`--!`,this.state=Q.COMMENT_END_DASH;break;case G.GREATER_THAN_SIGN:this._err(K.incorrectlyClosedComment),this.state=Q.DATA,this.emitCurrentComment(t);break;case G.EOF:this._err(K.eofInComment),this.emitCurrentComment(t),this._emitEOFToken();break;default:t.data+=`--!`,this.state=Q.COMMENT,this._stateComment(e)}}_stateDoctype(e){switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this.state=Q.BEFORE_DOCTYPE_NAME;break;case G.GREATER_THAN_SIGN:this.state=Q.BEFORE_DOCTYPE_NAME,this._stateBeforeDoctypeName(e);break;case G.EOF:{this._err(K.eofInDoctype),this._createDoctypeToken(null);let e=this.currentToken;e.forceQuirks=!0,this.emitCurrentDoctype(e),this._emitEOFToken();break}default:this._err(K.missingWhitespaceBeforeDoctypeName),this.state=Q.BEFORE_DOCTYPE_NAME,this._stateBeforeDoctypeName(e)}}_stateBeforeDoctypeName(e){if(X_(e))this._createDoctypeToken(String.fromCharCode(ev(e))),this.state=Q.DOCTYPE_NAME;else switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.NULL:this._err(K.unexpectedNullCharacter),this._createDoctypeToken(`�`),this.state=Q.DOCTYPE_NAME;break;case G.GREATER_THAN_SIGN:{this._err(K.missingDoctypeName),this._createDoctypeToken(null);let e=this.currentToken;e.forceQuirks=!0,this.emitCurrentDoctype(e),this.state=Q.DATA;break}case G.EOF:{this._err(K.eofInDoctype),this._createDoctypeToken(null);let e=this.currentToken;e.forceQuirks=!0,this.emitCurrentDoctype(e),this._emitEOFToken();break}default:this._createDoctypeToken(String.fromCodePoint(e)),this.state=Q.DOCTYPE_NAME}}_stateDoctypeName(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this.state=Q.AFTER_DOCTYPE_NAME;break;case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.NULL:this._err(K.unexpectedNullCharacter),t.name+=`�`;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:t.name+=String.fromCodePoint(X_(e)?ev(e):e)}}_stateAfterDoctypeName(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._consumeSequenceIfMatch(y_.PUBLIC,!1)?this.state=Q.AFTER_DOCTYPE_PUBLIC_KEYWORD:this._consumeSequenceIfMatch(y_.SYSTEM,!1)?this.state=Q.AFTER_DOCTYPE_SYSTEM_KEYWORD:this._ensureHibernation()||(this._err(K.invalidCharacterSequenceAfterDoctypeName),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e))}}_stateAfterDoctypePublicKeyword(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this.state=Q.BEFORE_DOCTYPE_PUBLIC_IDENTIFIER;break;case G.QUOTATION_MARK:this._err(K.missingWhitespaceAfterDoctypePublicKeyword),t.publicId=``,this.state=Q.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;break;case G.APOSTROPHE:this._err(K.missingWhitespaceAfterDoctypePublicKeyword),t.publicId=``,this.state=Q.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;break;case G.GREATER_THAN_SIGN:this._err(K.missingDoctypePublicIdentifier),t.forceQuirks=!0,this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.missingQuoteBeforeDoctypePublicIdentifier),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateBeforeDoctypePublicIdentifier(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.QUOTATION_MARK:t.publicId=``,this.state=Q.DOCTYPE_PUBLIC_IDENTIFIER_DOUBLE_QUOTED;break;case G.APOSTROPHE:t.publicId=``,this.state=Q.DOCTYPE_PUBLIC_IDENTIFIER_SINGLE_QUOTED;break;case G.GREATER_THAN_SIGN:this._err(K.missingDoctypePublicIdentifier),t.forceQuirks=!0,this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.missingQuoteBeforeDoctypePublicIdentifier),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateDoctypePublicIdentifierDoubleQuoted(e){let t=this.currentToken;switch(e){case G.QUOTATION_MARK:this.state=Q.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;break;case G.NULL:this._err(K.unexpectedNullCharacter),t.publicId+=`�`;break;case G.GREATER_THAN_SIGN:this._err(K.abruptDoctypePublicIdentifier),t.forceQuirks=!0,this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:t.publicId+=String.fromCodePoint(e)}}_stateDoctypePublicIdentifierSingleQuoted(e){let t=this.currentToken;switch(e){case G.APOSTROPHE:this.state=Q.AFTER_DOCTYPE_PUBLIC_IDENTIFIER;break;case G.NULL:this._err(K.unexpectedNullCharacter),t.publicId+=`�`;break;case G.GREATER_THAN_SIGN:this._err(K.abruptDoctypePublicIdentifier),t.forceQuirks=!0,this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:t.publicId+=String.fromCodePoint(e)}}_stateAfterDoctypePublicIdentifier(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this.state=Q.BETWEEN_DOCTYPE_PUBLIC_AND_SYSTEM_IDENTIFIERS;break;case G.GREATER_THAN_SIGN:this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.QUOTATION_MARK:this._err(K.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers),t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;break;case G.APOSTROPHE:this._err(K.missingWhitespaceBetweenDoctypePublicAndSystemIdentifiers),t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.missingQuoteBeforeDoctypeSystemIdentifier),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateBetweenDoctypePublicAndSystemIdentifiers(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.GREATER_THAN_SIGN:this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.QUOTATION_MARK:t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;break;case G.APOSTROPHE:t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.missingQuoteBeforeDoctypeSystemIdentifier),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateAfterDoctypeSystemKeyword(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:this.state=Q.BEFORE_DOCTYPE_SYSTEM_IDENTIFIER;break;case G.QUOTATION_MARK:this._err(K.missingWhitespaceAfterDoctypeSystemKeyword),t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;break;case G.APOSTROPHE:this._err(K.missingWhitespaceAfterDoctypeSystemKeyword),t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;break;case G.GREATER_THAN_SIGN:this._err(K.missingDoctypeSystemIdentifier),t.forceQuirks=!0,this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.missingQuoteBeforeDoctypeSystemIdentifier),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateBeforeDoctypeSystemIdentifier(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.QUOTATION_MARK:t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_DOUBLE_QUOTED;break;case G.APOSTROPHE:t.systemId=``,this.state=Q.DOCTYPE_SYSTEM_IDENTIFIER_SINGLE_QUOTED;break;case G.GREATER_THAN_SIGN:this._err(K.missingDoctypeSystemIdentifier),t.forceQuirks=!0,this.state=Q.DATA,this.emitCurrentDoctype(t);break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.missingQuoteBeforeDoctypeSystemIdentifier),t.forceQuirks=!0,this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateDoctypeSystemIdentifierDoubleQuoted(e){let t=this.currentToken;switch(e){case G.QUOTATION_MARK:this.state=Q.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;break;case G.NULL:this._err(K.unexpectedNullCharacter),t.systemId+=`�`;break;case G.GREATER_THAN_SIGN:this._err(K.abruptDoctypeSystemIdentifier),t.forceQuirks=!0,this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:t.systemId+=String.fromCodePoint(e)}}_stateDoctypeSystemIdentifierSingleQuoted(e){let t=this.currentToken;switch(e){case G.APOSTROPHE:this.state=Q.AFTER_DOCTYPE_SYSTEM_IDENTIFIER;break;case G.NULL:this._err(K.unexpectedNullCharacter),t.systemId+=`�`;break;case G.GREATER_THAN_SIGN:this._err(K.abruptDoctypeSystemIdentifier),t.forceQuirks=!0,this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:t.systemId+=String.fromCodePoint(e)}}_stateAfterDoctypeSystemIdentifier(e){let t=this.currentToken;switch(e){case G.SPACE:case G.LINE_FEED:case G.TABULATION:case G.FORM_FEED:break;case G.GREATER_THAN_SIGN:this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.EOF:this._err(K.eofInDoctype),t.forceQuirks=!0,this.emitCurrentDoctype(t),this._emitEOFToken();break;default:this._err(K.unexpectedCharacterAfterDoctypeSystemIdentifier),this.state=Q.BOGUS_DOCTYPE,this._stateBogusDoctype(e)}}_stateBogusDoctype(e){let t=this.currentToken;switch(e){case G.GREATER_THAN_SIGN:this.emitCurrentDoctype(t),this.state=Q.DATA;break;case G.NULL:this._err(K.unexpectedNullCharacter);break;case G.EOF:this.emitCurrentDoctype(t),this._emitEOFToken()}}_stateCdataSection(e){switch(e){case G.RIGHT_SQUARE_BRACKET:this.state=Q.CDATA_SECTION_BRACKET;break;case G.EOF:this._err(K.eofInCdata),this._emitEOFToken();break;default:this._emitCodePoint(e)}}_stateCdataSectionBracket(e){e===G.RIGHT_SQUARE_BRACKET?this.state=Q.CDATA_SECTION_END:(this._emitChars(`]`),this.state=Q.CDATA_SECTION,this._stateCdataSection(e))}_stateCdataSectionEnd(e){switch(e){case G.GREATER_THAN_SIGN:this.state=Q.DATA;break;case G.RIGHT_SQUARE_BRACKET:this._emitChars(`]`);break;default:this._emitChars(`]]`),this.state=Q.CDATA_SECTION,this._stateCdataSection(e)}}_stateCharacterReference(){let e=this.entityDecoder.write(this.preprocessor.html,this.preprocessor.pos);if(e<0){if(this.preprocessor.lastChunkWritten)e=this.entityDecoder.end();else{this.active=!1,this.preprocessor.pos=this.preprocessor.html.length-1,this.consumedAfterSnapshot=0,this.preprocessor.endOfChunkHit=!0;return}}e===0?(this.preprocessor.pos=this.entityStartPos,this._flushCodePointConsumedAsCharacterReference(G.AMPERSAND),this.state=!this._isCharacterReferenceInAttribute()&&$_(this.preprocessor.peek(1))?Q.AMBIGUOUS_AMPERSAND:this.returnState):this.state=this.returnState}_stateAmbiguousAmpersand(e){$_(e)?this._flushCodePointConsumedAsCharacterReference(e):(e===G.SEMICOLON&&this._err(K.unknownNamedCharacterReference),this.state=this.returnState,this._callState(e))}},av=new Set([X.DD,X.DT,X.LI,X.OPTGROUP,X.OPTION,X.P,X.RB,X.RP,X.RT,X.RTC]),ov=new Set([...av,X.CAPTION,X.COLGROUP,X.TBODY,X.TD,X.TFOOT,X.TH,X.THEAD,X.TR]),sv=new Set([X.APPLET,X.CAPTION,X.HTML,X.MARQUEE,X.OBJECT,X.TABLE,X.TD,X.TEMPLATE,X.TH]),cv=new Set([...sv,X.OL,X.UL]),lv=new Set([...sv,X.BUTTON]),uv=new Set([X.ANNOTATION_XML,X.MI,X.MN,X.MO,X.MS,X.MTEXT]),dv=new Set([X.DESC,X.FOREIGN_OBJECT,X.TITLE]),fv=new Set([X.TR,X.TEMPLATE,X.HTML]),pv=new Set([X.TBODY,X.TFOOT,X.THEAD,X.TEMPLATE,X.HTML]),mv=new Set([X.TABLE,X.TEMPLATE,X.HTML]),hv=new Set([X.TD,X.TH]),gv=class{get currentTmplContentOrNode(){return this._isInTemplate()?this.treeAdapter.getTemplateContent(this.current):this.current}constructor(e,t,n){this.treeAdapter=t,this.handler=n,this.items=[],this.tagIDs=[],this.stackTop=-1,this.tmplCount=0,this.currentTagId=X.UNKNOWN,this.current=e}_indexOf(e){return this.items.lastIndexOf(e,this.stackTop)}_isInTemplate(){return this.currentTagId===X.TEMPLATE&&this.treeAdapter.getNamespaceURI(this.current)===J.HTML}_updateCurrentElement(){this.current=this.items[this.stackTop],this.currentTagId=this.tagIDs[this.stackTop]}push(e,t){this.stackTop++,this.items[this.stackTop]=e,this.current=e,this.tagIDs[this.stackTop]=t,this.currentTagId=t,this._isInTemplate()&&this.tmplCount++,this.handler.onItemPush(e,t,!0)}pop(){let e=this.current;this.tmplCount>0&&this._isInTemplate()&&this.tmplCount--,this.stackTop--,this._updateCurrentElement(),this.handler.onItemPop(e,!0)}replace(e,t){let n=this._indexOf(e);this.items[n]=t,n===this.stackTop&&(this.current=t)}insertAfter(e,t,n){let r=this._indexOf(e)+1;this.items.splice(r,0,t),this.tagIDs.splice(r,0,n),this.stackTop++,r===this.stackTop&&this._updateCurrentElement(),this.current&&this.currentTagId!==void 0&&this.handler.onItemPush(this.current,this.currentTagId,r===this.stackTop)}popUntilTagNamePopped(e){let t=this.stackTop+1;do t=this.tagIDs.lastIndexOf(e,t-1);while(t>0&&this.treeAdapter.getNamespaceURI(this.items[t])!==J.HTML);this.shortenToLength(Math.max(t,0))}shortenToLength(e){for(;this.stackTop>=e;){let t=this.current;this.tmplCount>0&&this._isInTemplate()&&--this.tmplCount,this.stackTop--,this._updateCurrentElement(),this.handler.onItemPop(t,this.stackTop<e)}}popUntilElementPopped(e){let t=this._indexOf(e);this.shortenToLength(Math.max(t,0))}popUntilPopped(e,t){let n=this._indexOfTagNames(e,t);this.shortenToLength(Math.max(n,0))}popUntilNumberedHeaderPopped(){this.popUntilPopped(q_,J.HTML)}popUntilTableCellPopped(){this.popUntilPopped(hv,J.HTML)}popAllUpToHtmlElement(){this.tmplCount=0,this.shortenToLength(1)}_indexOfTagNames(e,t){for(let n=this.stackTop;n>=0;n--)if(e.has(this.tagIDs[n])&&this.treeAdapter.getNamespaceURI(this.items[n])===t)return n;return-1}clearBackTo(e,t){let n=this._indexOfTagNames(e,t);this.shortenToLength(n+1)}clearBackToTableContext(){this.clearBackTo(mv,J.HTML)}clearBackToTableBodyContext(){this.clearBackTo(pv,J.HTML)}clearBackToTableRowContext(){this.clearBackTo(fv,J.HTML)}remove(e){let t=this._indexOf(e);t>=0&&(t===this.stackTop?this.pop():(this.items.splice(t,1),this.tagIDs.splice(t,1),this.stackTop--,this._updateCurrentElement(),this.handler.onItemPop(e,!1)))}tryPeekProperlyNestedBodyElement(){return this.stackTop>=1&&this.tagIDs[1]===X.BODY?this.items[1]:null}contains(e){return this._indexOf(e)>-1}getCommonAncestor(e){let t=this._indexOf(e)-1;return t>=0?this.items[t]:null}isRootHtmlElementCurrent(){return this.stackTop===0&&this.tagIDs[0]===X.HTML}hasInDynamicScope(e,t){for(let n=this.stackTop;n>=0;n--){let r=this.tagIDs[n];switch(this.treeAdapter.getNamespaceURI(this.items[n])){case J.HTML:if(r===e)return!0;if(t.has(r))return!1;break;case J.SVG:if(dv.has(r))return!1;break;case J.MATHML:if(uv.has(r))return!1}}return!0}hasInScope(e){return this.hasInDynamicScope(e,sv)}hasInListItemScope(e){return this.hasInDynamicScope(e,cv)}hasInButtonScope(e){return this.hasInDynamicScope(e,lv)}hasNumberedHeaderInScope(){for(let e=this.stackTop;e>=0;e--){let t=this.tagIDs[e];switch(this.treeAdapter.getNamespaceURI(this.items[e])){case J.HTML:if(q_.has(t))return!0;if(sv.has(t))return!1;break;case J.SVG:if(dv.has(t))return!1;break;case J.MATHML:if(uv.has(t))return!1}}return!0}hasInTableScope(e){for(let t=this.stackTop;t>=0;t--)if(this.treeAdapter.getNamespaceURI(this.items[t])===J.HTML)switch(this.tagIDs[t]){case e:return!0;case X.TABLE:case X.HTML:return!1}return!0}hasTableBodyContextInTableScope(){for(let e=this.stackTop;e>=0;e--)if(this.treeAdapter.getNamespaceURI(this.items[e])===J.HTML)switch(this.tagIDs[e]){case X.TBODY:case X.THEAD:case X.TFOOT:return!0;case X.TABLE:case X.HTML:return!1}return!0}hasInSelectScope(e){for(let t=this.stackTop;t>=0;t--)if(this.treeAdapter.getNamespaceURI(this.items[t])===J.HTML)switch(this.tagIDs[t]){case e:return!0;case X.OPTION:case X.OPTGROUP:break;default:return!1}return!0}generateImpliedEndTags(){for(;this.currentTagId!==void 0&&av.has(this.currentTagId);)this.pop()}generateImpliedEndTagsThoroughly(){for(;this.currentTagId!==void 0&&ov.has(this.currentTagId);)this.pop()}generateImpliedEndTagsWithExclusion(e){for(;this.currentTagId!==void 0&&this.currentTagId!==e&&ov.has(this.currentTagId);)this.pop()}},_v=3,vv;(function(e){e[e.Marker=0]=`Marker`,e[e.Element=1]=`Element`})(vv||={});var yv={type:vv.Marker},bv=class{constructor(e){this.treeAdapter=e,this.entries=[],this.bookmark=null}_getNoahArkConditionCandidates(e,t){let n=[],r=t.length,i=this.treeAdapter.getTagName(e),a=this.treeAdapter.getNamespaceURI(e);for(let e=0;e<this.entries.length;e++){let t=this.entries[e];if(t.type===vv.Marker)break;let{element:o}=t;if(this.treeAdapter.getTagName(o)===i&&this.treeAdapter.getNamespaceURI(o)===a){let t=this.treeAdapter.getAttrList(o);t.length===r&&n.push({idx:e,attrs:t})}}return n}_ensureNoahArkCondition(e){if(this.entries.length<_v)return;let t=this.treeAdapter.getAttrList(e),n=this._getNoahArkConditionCandidates(e,t);if(n.length<_v)return;let r=new Map(t.map(e=>[e.name,e.value])),i=0;for(let e=0;e<n.length;e++){let t=n[e];t.attrs.every(e=>r.get(e.name)===e.value)&&(i+=1,i>=_v&&this.entries.splice(t.idx,1))}}insertMarker(){this.entries.unshift(yv)}pushElement(e,t){this._ensureNoahArkCondition(e),this.entries.unshift({type:vv.Element,element:e,token:t})}insertElementAfterBookmark(e,t){let n=this.entries.indexOf(this.bookmark);this.entries.splice(n,0,{type:vv.Element,element:e,token:t})}removeEntry(e){let t=this.entries.indexOf(e);t!==-1&&this.entries.splice(t,1)}clearToLastMarker(){let e=this.entries.indexOf(yv);e===-1?this.entries.length=0:this.entries.splice(0,e+1)}getElementEntryInScopeWithTagName(e){let t=this.entries.find(t=>t.type===vv.Marker||this.treeAdapter.getTagName(t.element)===e);return t&&t.type===vv.Element?t:null}getElementEntry(e){return this.entries.find(t=>t.type===vv.Element&&t.element===e)}},xv={createDocument(){return{nodeName:`#document`,mode:U_.NO_QUIRKS,childNodes:[]}},createDocumentFragment(){return{nodeName:`#document-fragment`,childNodes:[]}},createElement(e,t,n){return{nodeName:e,tagName:e,attrs:n,namespaceURI:t,childNodes:[],parentNode:null}},createCommentNode(e){return{nodeName:`#comment`,data:e,parentNode:null}},createTextNode(e){return{nodeName:`#text`,value:e,parentNode:null}},appendChild(e,t){e.childNodes.push(t),t.parentNode=e},insertBefore(e,t,n){let r=e.childNodes.indexOf(n);e.childNodes.splice(r,0,t),t.parentNode=e},setTemplateContent(e,t){e.content=t},getTemplateContent(e){return e.content},setDocumentType(e,t,n,r){let i=e.childNodes.find(e=>e.nodeName===`#documentType`);if(i)i.name=t,i.publicId=n,i.systemId=r;else{let i={nodeName:`#documentType`,name:t,publicId:n,systemId:r,parentNode:null};xv.appendChild(e,i)}},setDocumentMode(e,t){e.mode=t},getDocumentMode(e){return e.mode},detachNode(e){if(e.parentNode){let t=e.parentNode.childNodes.indexOf(e);e.parentNode.childNodes.splice(t,1),e.parentNode=null}},insertText(e,t){if(e.childNodes.length>0){let n=e.childNodes[e.childNodes.length-1];if(xv.isTextNode(n)){n.value+=t;return}}xv.appendChild(e,xv.createTextNode(t))},insertTextBefore(e,t,n){let r=e.childNodes[e.childNodes.indexOf(n)-1];r&&xv.isTextNode(r)?r.value+=t:xv.insertBefore(e,xv.createTextNode(t),n)},adoptAttributes(e,t){let n=new Set(e.attrs.map(e=>e.name));for(let r=0;r<t.length;r++)n.has(t[r].name)||e.attrs.push(t[r])},getFirstChild(e){return e.childNodes[0]},getChildNodes(e){return e.childNodes},getParentNode(e){return e.parentNode},getAttrList(e){return e.attrs},getTagName(e){return e.tagName},getNamespaceURI(e){return e.namespaceURI},getTextNodeContent(e){return e.value},getCommentNodeContent(e){return e.data},getDocumentTypeNodeName(e){return e.name},getDocumentTypeNodePublicId(e){return e.publicId},getDocumentTypeNodeSystemId(e){return e.systemId},isTextNode(e){return e.nodeName===`#text`},isCommentNode(e){return e.nodeName===`#comment`},isDocumentTypeNode(e){return e.nodeName===`#documentType`},isElementNode(e){return Object.prototype.hasOwnProperty.call(e,`tagName`)},setNodeSourceCodeLocation(e,t){e.sourceCodeLocation=t},getNodeSourceCodeLocation(e){return e.sourceCodeLocation},updateNodeSourceCodeLocation(e,t){e.sourceCodeLocation={...e.sourceCodeLocation,...t}}},Sv=`html`,Cv=`about:legacy-compat`,wv=`http://www.ibm.com/data/dtd/v11/ibmxhtml1-transitional.dtd`,Tv=`+//silmaril//dtd html pro v0r11 19970101//,-//as//dtd html 3.0 aswedit + extensions//,-//advasoft ltd//dtd html 3.0 aswedit + extensions//,-//ietf//dtd html 2.0 level 1//,-//ietf//dtd html 2.0 level 2//,-//ietf//dtd html 2.0 strict level 1//,-//ietf//dtd html 2.0 strict level 2//,-//ietf//dtd html 2.0 strict//,-//ietf//dtd html 2.0//,-//ietf//dtd html 2.1e//,-//ietf//dtd html 3.0//,-//ietf//dtd html 3.2 final//,-//ietf//dtd html 3.2//,-//ietf//dtd html 3//,-//ietf//dtd html level 0//,-//ietf//dtd html level 1//,-//ietf//dtd html level 2//,-//ietf//dtd html level 3//,-//ietf//dtd html strict level 0//,-//ietf//dtd html strict level 1//,-//ietf//dtd html strict level 2//,-//ietf//dtd html strict level 3//,-//ietf//dtd html strict//,-//ietf//dtd html//,-//metrius//dtd metrius presentational//,-//microsoft//dtd internet explorer 2.0 html strict//,-//microsoft//dtd internet explorer 2.0 html//,-//microsoft//dtd internet explorer 2.0 tables//,-//microsoft//dtd internet explorer 3.0 html strict//,-//microsoft//dtd internet explorer 3.0 html//,-//microsoft//dtd internet explorer 3.0 tables//,-//netscape comm. corp.//dtd html//,-//netscape comm. corp.//dtd strict html//,-//o'reilly and associates//dtd html 2.0//,-//o'reilly and associates//dtd html extended 1.0//,-//o'reilly and associates//dtd html extended relaxed 1.0//,-//sq//dtd html 2.0 hotmetal + extensions//,-//softquad software//dtd hotmetal pro 6.0::19990601::extensions to html 4.0//,-//softquad//dtd hotmetal pro 4.0::19971010::extensions to html 4.0//,-//spyglass//dtd html 2.0 extended//,-//sun microsystems corp.//dtd hotjava html//,-//sun microsystems corp.//dtd hotjava strict html//,-//w3c//dtd html 3 1995-03-24//,-//w3c//dtd html 3.2 draft//,-//w3c//dtd html 3.2 final//,-//w3c//dtd html 3.2//,-//w3c//dtd html 3.2s draft//,-//w3c//dtd html 4.0 frameset//,-//w3c//dtd html 4.0 transitional//,-//w3c//dtd html experimental 19960712//,-//w3c//dtd html experimental 970421//,-//w3c//dtd w3 html//,-//w3o//dtd w3 html 3.0//,-//webtechs//dtd mozilla html 2.0//,-//webtechs//dtd mozilla html//`.split(`,`),Ev=[...Tv,`-//w3c//dtd html 4.01 frameset//`,`-//w3c//dtd html 4.01 transitional//`],Dv=new Set([`-//w3o//dtd w3 html strict 3.0//en//`,`-/w3c/dtd html 4.0 transitional/en`,`html`]),Ov=[`-//w3c//dtd xhtml 1.0 frameset//`,`-//w3c//dtd xhtml 1.0 transitional//`],kv=[...Ov,`-//w3c//dtd html 4.01 frameset//`,`-//w3c//dtd html 4.01 transitional//`];function Av(e,t){return t.some(t=>e.startsWith(t))}function jv(e){return e.name===Sv&&e.publicId===null&&(e.systemId===null||e.systemId===Cv)}function Mv(e){if(e.name!==Sv)return U_.QUIRKS;let{systemId:t}=e;if(t&&t.toLowerCase()===wv)return U_.QUIRKS;let{publicId:n}=e;if(n!==null){if(n=n.toLowerCase(),Dv.has(n))return U_.QUIRKS;let e=t===null?Ev:Tv;if(Av(n,e))return U_.QUIRKS;if(e=t===null?Ov:kv,Av(n,e))return U_.LIMITED_QUIRKS}return U_.NO_QUIRKS}var Nv={TEXT_HTML:`text/html`,APPLICATION_XML:`application/xhtml+xml`},Pv=`definitionurl`,Fv=`definitionURL`,Iv=new Map(`attributeName.attributeType.baseFrequency.baseProfile.calcMode.clipPathUnits.diffuseConstant.edgeMode.filterUnits.glyphRef.gradientTransform.gradientUnits.kernelMatrix.kernelUnitLength.keyPoints.keySplines.keyTimes.lengthAdjust.limitingConeAngle.markerHeight.markerUnits.markerWidth.maskContentUnits.maskUnits.numOctaves.pathLength.patternContentUnits.patternTransform.patternUnits.pointsAtX.pointsAtY.pointsAtZ.preserveAlpha.preserveAspectRatio.primitiveUnits.refX.refY.repeatCount.repeatDur.requiredExtensions.requiredFeatures.specularConstant.specularExponent.spreadMethod.startOffset.stdDeviation.stitchTiles.surfaceScale.systemLanguage.tableValues.targetX.targetY.textLength.viewBox.viewTarget.xChannelSelector.yChannelSelector.zoomAndPan`.split(`.`).map(e=>[e.toLowerCase(),e])),Lv=new Map([[`xlink:actuate`,{prefix:`xlink`,name:`actuate`,namespace:J.XLINK}],[`xlink:arcrole`,{prefix:`xlink`,name:`arcrole`,namespace:J.XLINK}],[`xlink:href`,{prefix:`xlink`,name:`href`,namespace:J.XLINK}],[`xlink:role`,{prefix:`xlink`,name:`role`,namespace:J.XLINK}],[`xlink:show`,{prefix:`xlink`,name:`show`,namespace:J.XLINK}],[`xlink:title`,{prefix:`xlink`,name:`title`,namespace:J.XLINK}],[`xlink:type`,{prefix:`xlink`,name:`type`,namespace:J.XLINK}],[`xml:lang`,{prefix:`xml`,name:`lang`,namespace:J.XML}],[`xml:space`,{prefix:`xml`,name:`space`,namespace:J.XML}],[`xmlns`,{prefix:``,name:`xmlns`,namespace:J.XMLNS}],[`xmlns:xlink`,{prefix:`xmlns`,name:`xlink`,namespace:J.XMLNS}]]),Rv=new Map(`altGlyph.altGlyphDef.altGlyphItem.animateColor.animateMotion.animateTransform.clipPath.feBlend.feColorMatrix.feComponentTransfer.feComposite.feConvolveMatrix.feDiffuseLighting.feDisplacementMap.feDistantLight.feFlood.feFuncA.feFuncB.feFuncG.feFuncR.feGaussianBlur.feImage.feMerge.feMergeNode.feMorphology.feOffset.fePointLight.feSpecularLighting.feSpotLight.feTile.feTurbulence.foreignObject.glyphRef.linearGradient.radialGradient.textPath`.split(`.`).map(e=>[e.toLowerCase(),e])),zv=new Set([X.B,X.BIG,X.BLOCKQUOTE,X.BODY,X.BR,X.CENTER,X.CODE,X.DD,X.DIV,X.DL,X.DT,X.EM,X.EMBED,X.H1,X.H2,X.H3,X.H4,X.H5,X.H6,X.HEAD,X.HR,X.I,X.IMG,X.LI,X.LISTING,X.MENU,X.META,X.NOBR,X.OL,X.P,X.PRE,X.RUBY,X.S,X.SMALL,X.SPAN,X.STRONG,X.STRIKE,X.SUB,X.SUP,X.TABLE,X.TT,X.U,X.UL,X.VAR]);function Bv(e){let t=e.tagID;return t===X.FONT&&e.attrs.some(({name:e})=>e===H_.COLOR||e===H_.SIZE||e===H_.FACE)||zv.has(t)}function Vv(e){for(let t=0;t<e.attrs.length;t++)if(e.attrs[t].name===Pv){e.attrs[t].name=Fv;break}}function Hv(e){for(let t=0;t<e.attrs.length;t++){let n=Iv.get(e.attrs[t].name);n!=null&&(e.attrs[t].name=n)}}function Uv(e){for(let t=0;t<e.attrs.length;t++){let n=Lv.get(e.attrs[t].name);n&&(e.attrs[t].prefix=n.prefix,e.attrs[t].name=n.name,e.attrs[t].namespace=n.namespace)}}function Wv(e){let t=Rv.get(e.tagName);t!=null&&(e.tagName=t,e.tagID=G_(e.tagName))}function Gv(e,t){return t===J.MATHML&&(e===X.MI||e===X.MO||e===X.MN||e===X.MS||e===X.MTEXT)}function Kv(e,t,n){if(t===J.MATHML&&e===X.ANNOTATION_XML){for(let e=0;e<n.length;e++)if(n[e].name===H_.ENCODING){let t=n[e].value.toLowerCase();return t===Nv.TEXT_HTML||t===Nv.APPLICATION_XML}}return t===J.SVG&&(e===X.FOREIGN_OBJECT||e===X.DESC||e===X.TITLE)}function qv(e,t,n,r){return(!r||r===J.HTML)&&Kv(e,t,n)||(!r||r===J.MATHML)&&Gv(e,t)}var Jv=`hidden`,Yv=8,Xv=3,$;(function(e){e[e.INITIAL=0]=`INITIAL`,e[e.BEFORE_HTML=1]=`BEFORE_HTML`,e[e.BEFORE_HEAD=2]=`BEFORE_HEAD`,e[e.IN_HEAD=3]=`IN_HEAD`,e[e.IN_HEAD_NO_SCRIPT=4]=`IN_HEAD_NO_SCRIPT`,e[e.AFTER_HEAD=5]=`AFTER_HEAD`,e[e.IN_BODY=6]=`IN_BODY`,e[e.TEXT=7]=`TEXT`,e[e.IN_TABLE=8]=`IN_TABLE`,e[e.IN_TABLE_TEXT=9]=`IN_TABLE_TEXT`,e[e.IN_CAPTION=10]=`IN_CAPTION`,e[e.IN_COLUMN_GROUP=11]=`IN_COLUMN_GROUP`,e[e.IN_TABLE_BODY=12]=`IN_TABLE_BODY`,e[e.IN_ROW=13]=`IN_ROW`,e[e.IN_CELL=14]=`IN_CELL`,e[e.IN_SELECT=15]=`IN_SELECT`,e[e.IN_SELECT_IN_TABLE=16]=`IN_SELECT_IN_TABLE`,e[e.IN_TEMPLATE=17]=`IN_TEMPLATE`,e[e.AFTER_BODY=18]=`AFTER_BODY`,e[e.IN_FRAMESET=19]=`IN_FRAMESET`,e[e.AFTER_FRAMESET=20]=`AFTER_FRAMESET`,e[e.AFTER_AFTER_BODY=21]=`AFTER_AFTER_BODY`,e[e.AFTER_AFTER_FRAMESET=22]=`AFTER_AFTER_FRAMESET`})($||={});var Zv={startLine:-1,startCol:-1,startOffset:-1,endLine:-1,endCol:-1,endOffset:-1},Qv=new Set([X.TABLE,X.TBODY,X.TFOOT,X.THEAD,X.TR]),$v={scriptingEnabled:!0,sourceCodeLocationInfo:!1,treeAdapter:xv,onParseError:null},ey=class{constructor(e,t,n=null,r=null){this.fragmentContext=n,this.scriptHandler=r,this.currentToken=null,this.stopped=!1,this.insertionMode=$.INITIAL,this.originalInsertionMode=$.INITIAL,this.headElement=null,this.formElement=null,this.currentNotInHTML=!1,this.tmplInsertionModeStack=[],this.pendingCharacterTokens=[],this.hasNonWhitespacePendingCharacterToken=!1,this.framesetOk=!0,this.skipNextNewLine=!1,this.fosterParentingEnabled=!1,this.options={...$v,...e},this.treeAdapter=this.options.treeAdapter,this.onParseError=this.options.onParseError,this.onParseError&&(this.options.sourceCodeLocationInfo=!0),this.document=t??this.treeAdapter.createDocument(),this.tokenizer=new iv(this.options,this),this.activeFormattingElements=new bv(this.treeAdapter),this.fragmentContextID=n?G_(this.treeAdapter.getTagName(n)):X.UNKNOWN,this._setContextModes(n??this.document,this.fragmentContextID),this.openElements=new gv(this.document,this.treeAdapter,this)}static parse(e,t){let n=new this(t);return n.tokenizer.write(e,!0),n.document}static getFragmentParser(e,t){let n={...$v,...t};e??=n.treeAdapter.createElement(Y.TEMPLATE,J.HTML,[]);let r=n.treeAdapter.createElement(`documentmock`,J.HTML,[]),i=new this(n,r,e);return i.fragmentContextID===X.TEMPLATE&&i.tmplInsertionModeStack.unshift($.IN_TEMPLATE),i._initTokenizerForFragmentParsing(),i._insertFakeRootElement(),i._resetInsertionMode(),i._findFormInFragmentContext(),i}getFragment(){let e=this.treeAdapter.getFirstChild(this.document),t=this.treeAdapter.createDocumentFragment();return this._adoptNodes(e,t),t}_err(e,t,n){if(!this.onParseError)return;let r=e.location??Zv,i={code:t,startLine:r.startLine,startCol:r.startCol,startOffset:r.startOffset,endLine:n?r.startLine:r.endLine,endCol:n?r.startCol:r.endCol,endOffset:n?r.startOffset:r.endOffset};this.onParseError(i)}onItemPush(e,t,n){var r,i;(i=(r=this.treeAdapter).onItemPush)==null||i.call(r,e),n&&this.openElements.stackTop>0&&this._setContextModes(e,t)}onItemPop(e,t){var n,r;if(this.options.sourceCodeLocationInfo&&this._setEndLocation(e,this.currentToken),(r=(n=this.treeAdapter).onItemPop)==null||r.call(n,e,this.openElements.current),t){let e,t;this.openElements.stackTop===0&&this.fragmentContext?(e=this.fragmentContext,t=this.fragmentContextID):{current:e,currentTagId:t}=this.openElements,this._setContextModes(e,t)}}_setContextModes(e,t){let n=e===this.document||e&&this.treeAdapter.getNamespaceURI(e)===J.HTML;this.currentNotInHTML=!n,this.tokenizer.inForeignNode=!n&&e!==void 0&&t!==void 0&&!this._isIntegrationPoint(t,e)}_switchToTextParsing(e,t){this._insertElement(e,J.HTML),this.tokenizer.state=t,this.originalInsertionMode=this.insertionMode,this.insertionMode=$.TEXT}switchToPlaintextParsing(){this.insertionMode=$.TEXT,this.originalInsertionMode=$.IN_BODY,this.tokenizer.state=J_.PLAINTEXT}_getAdjustedCurrentElement(){return this.openElements.stackTop===0&&this.fragmentContext?this.fragmentContext:this.openElements.current}_findFormInFragmentContext(){let e=this.fragmentContext;for(;e;){if(this.treeAdapter.getTagName(e)===Y.FORM){this.formElement=e;break}e=this.treeAdapter.getParentNode(e)}}_initTokenizerForFragmentParsing(){if(!(!this.fragmentContext||this.treeAdapter.getNamespaceURI(this.fragmentContext)!==J.HTML))switch(this.fragmentContextID){case X.TITLE:case X.TEXTAREA:this.tokenizer.state=J_.RCDATA;break;case X.STYLE:case X.XMP:case X.IFRAME:case X.NOEMBED:case X.NOFRAMES:case X.NOSCRIPT:this.tokenizer.state=J_.RAWTEXT;break;case X.SCRIPT:this.tokenizer.state=J_.SCRIPT_DATA;break;case X.PLAINTEXT:this.tokenizer.state=J_.PLAINTEXT}}_setDocumentType(e){let t=e.name||``,n=e.publicId||``,r=e.systemId||``;if(this.treeAdapter.setDocumentType(this.document,t,n,r),e.location){let t=this.treeAdapter.getChildNodes(this.document).find(e=>this.treeAdapter.isDocumentTypeNode(e));t&&this.treeAdapter.setNodeSourceCodeLocation(t,e.location)}}_attachElementToTree(e,t){if(this.options.sourceCodeLocationInfo){let n=t&&{...t,startTag:t};this.treeAdapter.setNodeSourceCodeLocation(e,n)}if(this._shouldFosterParentOnInsertion())this._fosterParentElement(e);else{let t=this.openElements.currentTmplContentOrNode;this.treeAdapter.appendChild(t??this.document,e)}}_appendElement(e,t){let n=this.treeAdapter.createElement(e.tagName,t,e.attrs);this._attachElementToTree(n,e.location)}_insertElement(e,t){let n=this.treeAdapter.createElement(e.tagName,t,e.attrs);this._attachElementToTree(n,e.location),this.openElements.push(n,e.tagID)}_insertFakeElement(e,t){let n=this.treeAdapter.createElement(e,J.HTML,[]);this._attachElementToTree(n,null),this.openElements.push(n,t)}_insertTemplate(e){let t=this.treeAdapter.createElement(e.tagName,J.HTML,e.attrs),n=this.treeAdapter.createDocumentFragment();this.treeAdapter.setTemplateContent(t,n),this._attachElementToTree(t,e.location),this.openElements.push(t,e.tagID),this.options.sourceCodeLocationInfo&&this.treeAdapter.setNodeSourceCodeLocation(n,null)}_insertFakeRootElement(){let e=this.treeAdapter.createElement(Y.HTML,J.HTML,[]);this.options.sourceCodeLocationInfo&&this.treeAdapter.setNodeSourceCodeLocation(e,null),this.treeAdapter.appendChild(this.openElements.current,e),this.openElements.push(e,X.HTML)}_appendCommentNode(e,t){let n=this.treeAdapter.createCommentNode(e.data);this.treeAdapter.appendChild(t,n),this.options.sourceCodeLocationInfo&&this.treeAdapter.setNodeSourceCodeLocation(n,e.location)}_insertCharacters(e){let t,n;if(this._shouldFosterParentOnInsertion()?({parent:t,beforeElement:n}=this._findFosterParentingLocation(),n?this.treeAdapter.insertTextBefore(t,e.chars,n):this.treeAdapter.insertText(t,e.chars)):(t=this.openElements.currentTmplContentOrNode,this.treeAdapter.insertText(t,e.chars)),!e.location)return;let r=this.treeAdapter.getChildNodes(t),i=r[(n?r.lastIndexOf(n):r.length)-1];if(this.treeAdapter.getNodeSourceCodeLocation(i)){let{endLine:t,endCol:n,endOffset:r}=e.location;this.treeAdapter.updateNodeSourceCodeLocation(i,{endLine:t,endCol:n,endOffset:r})}else this.options.sourceCodeLocationInfo&&this.treeAdapter.setNodeSourceCodeLocation(i,e.location)}_adoptNodes(e,t){for(let n=this.treeAdapter.getFirstChild(e);n;n=this.treeAdapter.getFirstChild(e))this.treeAdapter.detachNode(n),this.treeAdapter.appendChild(t,n)}_setEndLocation(e,t){if(this.treeAdapter.getNodeSourceCodeLocation(e)&&t.location){let n=t.location,r=this.treeAdapter.getTagName(e),i=t.type===q.END_TAG&&r===t.tagName?{endTag:{...n},endLine:n.endLine,endCol:n.endCol,endOffset:n.endOffset}:{endLine:n.startLine,endCol:n.startCol,endOffset:n.startOffset};this.treeAdapter.updateNodeSourceCodeLocation(e,i)}}shouldProcessStartTagTokenInForeignContent(e){if(!this.currentNotInHTML)return!1;let t,n;return this.openElements.stackTop===0&&this.fragmentContext?(t=this.fragmentContext,n=this.fragmentContextID):{current:t,currentTagId:n}=this.openElements,e.tagID===X.SVG&&this.treeAdapter.getTagName(t)===Y.ANNOTATION_XML&&this.treeAdapter.getNamespaceURI(t)===J.MATHML?!1:this.tokenizer.inForeignNode||(e.tagID===X.MGLYPH||e.tagID===X.MALIGNMARK)&&n!==void 0&&!this._isIntegrationPoint(n,t,J.HTML)}_processToken(e){switch(e.type){case q.CHARACTER:this.onCharacter(e);break;case q.NULL_CHARACTER:this.onNullCharacter(e);break;case q.COMMENT:this.onComment(e);break;case q.DOCTYPE:this.onDoctype(e);break;case q.START_TAG:this._processStartTag(e);break;case q.END_TAG:this.onEndTag(e);break;case q.EOF:this.onEof(e);break;case q.WHITESPACE_CHARACTER:this.onWhitespaceCharacter(e)}}_isIntegrationPoint(e,t,n){return qv(e,this.treeAdapter.getNamespaceURI(t),this.treeAdapter.getAttrList(t),n)}_reconstructActiveFormattingElements(){let e=this.activeFormattingElements.entries.length;if(e){let t=this.activeFormattingElements.entries.findIndex(e=>e.type===vv.Marker||this.openElements.contains(e.element)),n=t===-1?e-1:t-1;for(let e=n;e>=0;e--){let t=this.activeFormattingElements.entries[e];this._insertElement(t.token,this.treeAdapter.getNamespaceURI(t.element)),t.element=this.openElements.current}}}_closeTableCell(){this.openElements.generateImpliedEndTags(),this.openElements.popUntilTableCellPopped(),this.activeFormattingElements.clearToLastMarker(),this.insertionMode=$.IN_ROW}_closePElement(){this.openElements.generateImpliedEndTagsWithExclusion(X.P),this.openElements.popUntilTagNamePopped(X.P)}_resetInsertionMode(){for(let e=this.openElements.stackTop;e>=0;e--)switch(e===0&&this.fragmentContext?this.fragmentContextID:this.openElements.tagIDs[e]){case X.TR:this.insertionMode=$.IN_ROW;return;case X.TBODY:case X.THEAD:case X.TFOOT:this.insertionMode=$.IN_TABLE_BODY;return;case X.CAPTION:this.insertionMode=$.IN_CAPTION;return;case X.COLGROUP:this.insertionMode=$.IN_COLUMN_GROUP;return;case X.TABLE:this.insertionMode=$.IN_TABLE;return;case X.BODY:this.insertionMode=$.IN_BODY;return;case X.FRAMESET:this.insertionMode=$.IN_FRAMESET;return;case X.SELECT:this._resetInsertionModeForSelect(e);return;case X.TEMPLATE:this.insertionMode=this.tmplInsertionModeStack[0];return;case X.HTML:this.insertionMode=this.headElement?$.AFTER_HEAD:$.BEFORE_HEAD;return;case X.TD:case X.TH:if(e>0){this.insertionMode=$.IN_CELL;return}break;case X.HEAD:if(e>0){this.insertionMode=$.IN_HEAD;return}}this.insertionMode=$.IN_BODY}_resetInsertionModeForSelect(e){if(e>0)for(let t=e-1;t>0;t--){let e=this.openElements.tagIDs[t];if(e===X.TEMPLATE)break;if(e===X.TABLE){this.insertionMode=$.IN_SELECT_IN_TABLE;return}}this.insertionMode=$.IN_SELECT}_isElementCausesFosterParenting(e){return Qv.has(e)}_shouldFosterParentOnInsertion(){return this.fosterParentingEnabled&&this.openElements.currentTagId!==void 0&&this._isElementCausesFosterParenting(this.openElements.currentTagId)}_findFosterParentingLocation(){for(let e=this.openElements.stackTop;e>=0;e--){let t=this.openElements.items[e];switch(this.openElements.tagIDs[e]){case X.TEMPLATE:if(this.treeAdapter.getNamespaceURI(t)===J.HTML)return{parent:this.treeAdapter.getTemplateContent(t),beforeElement:null};break;case X.TABLE:{let n=this.treeAdapter.getParentNode(t);return n?{parent:n,beforeElement:t}:{parent:this.openElements.items[e-1],beforeElement:null}}}}return{parent:this.openElements.items[0],beforeElement:null}}_fosterParentElement(e){let t=this._findFosterParentingLocation();t.beforeElement?this.treeAdapter.insertBefore(t.parent,e,t.beforeElement):this.treeAdapter.appendChild(t.parent,e)}_isSpecialElement(e,t){return K_[this.treeAdapter.getNamespaceURI(e)].has(t)}onCharacter(e){if(this.skipNextNewLine=!1,this.tokenizer.inForeignNode){vx(this,e);return}switch(this.insertionMode){case $.INITIAL:py(this,e);break;case $.BEFORE_HTML:gy(this,e);break;case $.BEFORE_HEAD:yy(this,e);break;case $.IN_HEAD:Cy(this,e);break;case $.IN_HEAD_NO_SCRIPT:Ey(this,e);break;case $.AFTER_HEAD:ky(this,e);break;case $.IN_BODY:case $.IN_CAPTION:case $.IN_CELL:case $.IN_TEMPLATE:My(this,e);break;case $.TEXT:case $.IN_SELECT:case $.IN_SELECT_IN_TABLE:this._insertCharacters(e);break;case $.IN_TABLE:case $.IN_TABLE_BODY:case $.IN_ROW:Db(this,e);break;case $.IN_TABLE_TEXT:Bb(this,e);break;case $.IN_COLUMN_GROUP:qb(this,e);break;case $.AFTER_BODY:lx(this,e);break;case $.AFTER_AFTER_BODY:hx(this,e)}}onNullCharacter(e){if(this.skipNextNewLine=!1,this.tokenizer.inForeignNode){_x(this,e);return}switch(this.insertionMode){case $.INITIAL:py(this,e);break;case $.BEFORE_HTML:gy(this,e);break;case $.BEFORE_HEAD:yy(this,e);break;case $.IN_HEAD:Cy(this,e);break;case $.IN_HEAD_NO_SCRIPT:Ey(this,e);break;case $.AFTER_HEAD:ky(this,e);break;case $.TEXT:this._insertCharacters(e);break;case $.IN_TABLE:case $.IN_TABLE_BODY:case $.IN_ROW:Db(this,e);break;case $.IN_COLUMN_GROUP:qb(this,e);break;case $.AFTER_BODY:lx(this,e);break;case $.AFTER_AFTER_BODY:hx(this,e)}}onComment(e){if(this.skipNextNewLine=!1,this.currentNotInHTML){cy(this,e);return}switch(this.insertionMode){case $.INITIAL:case $.BEFORE_HTML:case $.BEFORE_HEAD:case $.IN_HEAD:case $.IN_HEAD_NO_SCRIPT:case $.AFTER_HEAD:case $.IN_BODY:case $.IN_TABLE:case $.IN_CAPTION:case $.IN_COLUMN_GROUP:case $.IN_TABLE_BODY:case $.IN_ROW:case $.IN_CELL:case $.IN_SELECT:case $.IN_SELECT_IN_TABLE:case $.IN_TEMPLATE:case $.IN_FRAMESET:case $.AFTER_FRAMESET:cy(this,e);break;case $.IN_TABLE_TEXT:Vb(this,e);break;case $.AFTER_BODY:ly(this,e);break;case $.AFTER_AFTER_BODY:case $.AFTER_AFTER_FRAMESET:uy(this,e)}}onDoctype(e){switch(this.skipNextNewLine=!1,this.insertionMode){case $.INITIAL:fy(this,e);break;case $.BEFORE_HEAD:case $.IN_HEAD:case $.IN_HEAD_NO_SCRIPT:case $.AFTER_HEAD:this._err(e,K.misplacedDoctype);break;case $.IN_TABLE_TEXT:Vb(this,e)}}onStartTag(e){this.skipNextNewLine=!1,this.currentToken=e,this._processStartTag(e),e.selfClosing&&!e.ackSelfClosing&&this._err(e,K.nonVoidHtmlElementStartTagWithTrailingSolidus)}_processStartTag(e){this.shouldProcessStartTagTokenInForeignContent(e)?bx(this,e):this._startTagOutsideForeignContent(e)}_startTagOutsideForeignContent(e){switch(this.insertionMode){case $.INITIAL:py(this,e);break;case $.BEFORE_HTML:my(this,e);break;case $.BEFORE_HEAD:_y(this,e);break;case $.IN_HEAD:by(this,e);break;case $.IN_HEAD_NO_SCRIPT:wy(this,e);break;case $.AFTER_HEAD:Dy(this,e);break;case $.IN_BODY:db(this,e);break;case $.IN_TABLE:Ib(this,e);break;case $.IN_TABLE_TEXT:Vb(this,e);break;case $.IN_CAPTION:Ub(this,e);break;case $.IN_COLUMN_GROUP:Gb(this,e);break;case $.IN_TABLE_BODY:Jb(this,e);break;case $.IN_ROW:Xb(this,e);break;case $.IN_CELL:Qb(this,e);break;case $.IN_SELECT:ex(this,e);break;case $.IN_SELECT_IN_TABLE:nx(this,e);break;case $.IN_TEMPLATE:ix(this,e);break;case $.AFTER_BODY:sx(this,e);break;case $.IN_FRAMESET:ux(this,e);break;case $.AFTER_FRAMESET:fx(this,e);break;case $.AFTER_AFTER_BODY:mx(this,e);break;case $.AFTER_AFTER_FRAMESET:gx(this,e)}}onEndTag(e){this.skipNextNewLine=!1,this.currentToken=e,this.currentNotInHTML?xx(this,e):this._endTagOutsideForeignContent(e)}_endTagOutsideForeignContent(e){switch(this.insertionMode){case $.INITIAL:py(this,e);break;case $.BEFORE_HTML:hy(this,e);break;case $.BEFORE_HEAD:vy(this,e);break;case $.IN_HEAD:xy(this,e);break;case $.IN_HEAD_NO_SCRIPT:Ty(this,e);break;case $.AFTER_HEAD:Oy(this,e);break;case $.IN_BODY:Cb(this,e);break;case $.TEXT:Tb(this,e);break;case $.IN_TABLE:Lb(this,e);break;case $.IN_TABLE_TEXT:Vb(this,e);break;case $.IN_CAPTION:Wb(this,e);break;case $.IN_COLUMN_GROUP:Kb(this,e);break;case $.IN_TABLE_BODY:Yb(this,e);break;case $.IN_ROW:Zb(this,e);break;case $.IN_CELL:$b(this,e);break;case $.IN_SELECT:tx(this,e);break;case $.IN_SELECT_IN_TABLE:rx(this,e);break;case $.IN_TEMPLATE:ax(this,e);break;case $.AFTER_BODY:cx(this,e);break;case $.IN_FRAMESET:dx(this,e);break;case $.AFTER_FRAMESET:px(this,e);break;case $.AFTER_AFTER_BODY:hx(this,e)}}onEof(e){switch(this.insertionMode){case $.INITIAL:py(this,e);break;case $.BEFORE_HTML:gy(this,e);break;case $.BEFORE_HEAD:yy(this,e);break;case $.IN_HEAD:Cy(this,e);break;case $.IN_HEAD_NO_SCRIPT:Ey(this,e);break;case $.AFTER_HEAD:ky(this,e);break;case $.IN_BODY:case $.IN_TABLE:case $.IN_CAPTION:case $.IN_COLUMN_GROUP:case $.IN_TABLE_BODY:case $.IN_ROW:case $.IN_CELL:case $.IN_SELECT:case $.IN_SELECT_IN_TABLE:wb(this,e);break;case $.TEXT:Eb(this,e);break;case $.IN_TABLE_TEXT:Vb(this,e);break;case $.IN_TEMPLATE:ox(this,e);break;case $.AFTER_BODY:case $.IN_FRAMESET:case $.AFTER_FRAMESET:case $.AFTER_AFTER_BODY:case $.AFTER_AFTER_FRAMESET:dy(this,e)}}onWhitespaceCharacter(e){if(this.skipNextNewLine&&(this.skipNextNewLine=!1,e.chars.charCodeAt(0)===G.LINE_FEED)){if(e.chars.length===1)return;e.chars=e.chars.substr(1)}if(this.tokenizer.inForeignNode){this._insertCharacters(e);return}switch(this.insertionMode){case $.IN_HEAD:case $.IN_HEAD_NO_SCRIPT:case $.AFTER_HEAD:case $.TEXT:case $.IN_COLUMN_GROUP:case $.IN_SELECT:case $.IN_SELECT_IN_TABLE:case $.IN_FRAMESET:case $.AFTER_FRAMESET:this._insertCharacters(e);break;case $.IN_BODY:case $.IN_CAPTION:case $.IN_CELL:case $.IN_TEMPLATE:case $.AFTER_BODY:case $.AFTER_AFTER_BODY:case $.AFTER_AFTER_FRAMESET:jy(this,e);break;case $.IN_TABLE:case $.IN_TABLE_BODY:case $.IN_ROW:Db(this,e);break;case $.IN_TABLE_TEXT:zb(this,e)}}};function ty(e,t){let n=e.activeFormattingElements.getElementEntryInScopeWithTagName(t.tagName);return n?e.openElements.contains(n.element)?e.openElements.hasInScope(t.tagID)||(n=null):(e.activeFormattingElements.removeEntry(n),n=null):Sb(e,t),n}function ny(e,t){let n=null,r=e.openElements.stackTop;for(;r>=0;r--){let i=e.openElements.items[r];if(i===t.element)break;e._isSpecialElement(i,e.openElements.tagIDs[r])&&(n=i)}return n||(e.openElements.shortenToLength(Math.max(r,0)),e.activeFormattingElements.removeEntry(t)),n}function ry(e,t,n){let r=t,i=e.openElements.getCommonAncestor(t);for(let a=0,o=i;o!==n;a++,o=i){i=e.openElements.getCommonAncestor(o);let n=e.activeFormattingElements.getElementEntry(o),s=n&&a>=Xv;!n||s?(s&&e.activeFormattingElements.removeEntry(n),e.openElements.remove(o)):(o=iy(e,n),r===t&&(e.activeFormattingElements.bookmark=n),e.treeAdapter.detachNode(r),e.treeAdapter.appendChild(o,r),r=o)}return r}function iy(e,t){let n=e.treeAdapter.getNamespaceURI(t.element),r=e.treeAdapter.createElement(t.token.tagName,n,t.token.attrs);return e.openElements.replace(t.element,r),t.element=r,r}function ay(e,t,n){let r=G_(e.treeAdapter.getTagName(t));if(e._isElementCausesFosterParenting(r))e._fosterParentElement(n);else{let i=e.treeAdapter.getNamespaceURI(t);r===X.TEMPLATE&&i===J.HTML&&(t=e.treeAdapter.getTemplateContent(t)),e.treeAdapter.appendChild(t,n)}}function oy(e,t,n){let r=e.treeAdapter.getNamespaceURI(n.element),{token:i}=n,a=e.treeAdapter.createElement(i.tagName,r,i.attrs);e._adoptNodes(t,a),e.treeAdapter.appendChild(t,a),e.activeFormattingElements.insertElementAfterBookmark(a,i),e.activeFormattingElements.removeEntry(n),e.openElements.remove(n.element),e.openElements.insertAfter(t,a,i.tagID)}function sy(e,t){for(let n=0;n<Yv;n++){let n=ty(e,t);if(!n)break;let r=ny(e,n);if(!r)break;e.activeFormattingElements.bookmark=n;let i=ry(e,r,n.element),a=e.openElements.getCommonAncestor(n.element);e.treeAdapter.detachNode(i),a&&ay(e,a,i),oy(e,r,n)}}function cy(e,t){e._appendCommentNode(t,e.openElements.currentTmplContentOrNode)}function ly(e,t){e._appendCommentNode(t,e.openElements.items[0])}function uy(e,t){e._appendCommentNode(t,e.document)}function dy(e,t){if(e.stopped=!0,t.location){let n=e.fragmentContext?0:2;for(let r=e.openElements.stackTop;r>=n;r--)e._setEndLocation(e.openElements.items[r],t);if(!e.fragmentContext&&e.openElements.stackTop>=0){let n=e.openElements.items[0],r=e.treeAdapter.getNodeSourceCodeLocation(n);if(r&&!r.endTag&&(e._setEndLocation(n,t),e.openElements.stackTop>=1)){let n=e.openElements.items[1],r=e.treeAdapter.getNodeSourceCodeLocation(n);r&&!r.endTag&&e._setEndLocation(n,t)}}}}function fy(e,t){e._setDocumentType(t);let n=t.forceQuirks?U_.QUIRKS:Mv(t);jv(t)||e._err(t,K.nonConformingDoctype),e.treeAdapter.setDocumentMode(e.document,n),e.insertionMode=$.BEFORE_HTML}function py(e,t){e._err(t,K.missingDoctype,!0),e.treeAdapter.setDocumentMode(e.document,U_.QUIRKS),e.insertionMode=$.BEFORE_HTML,e._processToken(t)}function my(e,t){t.tagID===X.HTML?(e._insertElement(t,J.HTML),e.insertionMode=$.BEFORE_HEAD):gy(e,t)}function hy(e,t){let n=t.tagID;(n===X.HTML||n===X.HEAD||n===X.BODY||n===X.BR)&&gy(e,t)}function gy(e,t){e._insertFakeRootElement(),e.insertionMode=$.BEFORE_HEAD,e._processToken(t)}function _y(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.HEAD:e._insertElement(t,J.HTML),e.headElement=e.openElements.current,e.insertionMode=$.IN_HEAD;break;default:yy(e,t)}}function vy(e,t){let n=t.tagID;n===X.HEAD||n===X.BODY||n===X.HTML||n===X.BR?yy(e,t):e._err(t,K.endTagWithoutMatchingOpenElement)}function yy(e,t){e._insertFakeElement(Y.HEAD,X.HEAD),e.headElement=e.openElements.current,e.insertionMode=$.IN_HEAD,e._processToken(t)}function by(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.BASE:case X.BASEFONT:case X.BGSOUND:case X.LINK:case X.META:e._appendElement(t,J.HTML),t.ackSelfClosing=!0;break;case X.TITLE:e._switchToTextParsing(t,J_.RCDATA);break;case X.NOSCRIPT:e.options.scriptingEnabled?e._switchToTextParsing(t,J_.RAWTEXT):(e._insertElement(t,J.HTML),e.insertionMode=$.IN_HEAD_NO_SCRIPT);break;case X.NOFRAMES:case X.STYLE:e._switchToTextParsing(t,J_.RAWTEXT);break;case X.SCRIPT:e._switchToTextParsing(t,J_.SCRIPT_DATA);break;case X.TEMPLATE:e._insertTemplate(t),e.activeFormattingElements.insertMarker(),e.framesetOk=!1,e.insertionMode=$.IN_TEMPLATE,e.tmplInsertionModeStack.unshift($.IN_TEMPLATE);break;case X.HEAD:e._err(t,K.misplacedStartTagForHeadElement);break;default:Cy(e,t)}}function xy(e,t){switch(t.tagID){case X.HEAD:e.openElements.pop(),e.insertionMode=$.AFTER_HEAD;break;case X.BODY:case X.BR:case X.HTML:Cy(e,t);break;case X.TEMPLATE:Sy(e,t);break;default:e._err(t,K.endTagWithoutMatchingOpenElement)}}function Sy(e,t){e.openElements.tmplCount>0?(e.openElements.generateImpliedEndTagsThoroughly(),e.openElements.currentTagId!==X.TEMPLATE&&e._err(t,K.closingOfElementWithOpenChildElements),e.openElements.popUntilTagNamePopped(X.TEMPLATE),e.activeFormattingElements.clearToLastMarker(),e.tmplInsertionModeStack.shift(),e._resetInsertionMode()):e._err(t,K.endTagWithoutMatchingOpenElement)}function Cy(e,t){e.openElements.pop(),e.insertionMode=$.AFTER_HEAD,e._processToken(t)}function wy(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.BASEFONT:case X.BGSOUND:case X.HEAD:case X.LINK:case X.META:case X.NOFRAMES:case X.STYLE:by(e,t);break;case X.NOSCRIPT:e._err(t,K.nestedNoscriptInHead);break;default:Ey(e,t)}}function Ty(e,t){switch(t.tagID){case X.NOSCRIPT:e.openElements.pop(),e.insertionMode=$.IN_HEAD;break;case X.BR:Ey(e,t);break;default:e._err(t,K.endTagWithoutMatchingOpenElement)}}function Ey(e,t){let n=t.type===q.EOF?K.openElementsLeftAfterEof:K.disallowedContentInNoscriptInHead;e._err(t,n),e.openElements.pop(),e.insertionMode=$.IN_HEAD,e._processToken(t)}function Dy(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.BODY:e._insertElement(t,J.HTML),e.framesetOk=!1,e.insertionMode=$.IN_BODY;break;case X.FRAMESET:e._insertElement(t,J.HTML),e.insertionMode=$.IN_FRAMESET;break;case X.BASE:case X.BASEFONT:case X.BGSOUND:case X.LINK:case X.META:case X.NOFRAMES:case X.SCRIPT:case X.STYLE:case X.TEMPLATE:case X.TITLE:e._err(t,K.abandonedHeadElementChild),e.openElements.push(e.headElement,X.HEAD),by(e,t),e.openElements.remove(e.headElement);break;case X.HEAD:e._err(t,K.misplacedStartTagForHeadElement);break;default:ky(e,t)}}function Oy(e,t){switch(t.tagID){case X.BODY:case X.HTML:case X.BR:ky(e,t);break;case X.TEMPLATE:Sy(e,t);break;default:e._err(t,K.endTagWithoutMatchingOpenElement)}}function ky(e,t){e._insertFakeElement(Y.BODY,X.BODY),e.insertionMode=$.IN_BODY,Ay(e,t)}function Ay(e,t){switch(t.type){case q.CHARACTER:My(e,t);break;case q.WHITESPACE_CHARACTER:jy(e,t);break;case q.COMMENT:cy(e,t);break;case q.START_TAG:db(e,t);break;case q.END_TAG:Cb(e,t);break;case q.EOF:wb(e,t)}}function jy(e,t){e._reconstructActiveFormattingElements(),e._insertCharacters(t)}function My(e,t){e._reconstructActiveFormattingElements(),e._insertCharacters(t),e.framesetOk=!1}function Ny(e,t){e.openElements.tmplCount===0&&e.treeAdapter.adoptAttributes(e.openElements.items[0],t.attrs)}function Py(e,t){let n=e.openElements.tryPeekProperlyNestedBodyElement();n&&e.openElements.tmplCount===0&&(e.framesetOk=!1,e.treeAdapter.adoptAttributes(n,t.attrs))}function Fy(e,t){let n=e.openElements.tryPeekProperlyNestedBodyElement();e.framesetOk&&n&&(e.treeAdapter.detachNode(n),e.openElements.popAllUpToHtmlElement(),e._insertElement(t,J.HTML),e.insertionMode=$.IN_FRAMESET)}function Iy(e,t){e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._insertElement(t,J.HTML)}function Ly(e,t){e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e.openElements.currentTagId!==void 0&&q_.has(e.openElements.currentTagId)&&e.openElements.pop(),e._insertElement(t,J.HTML)}function Ry(e,t){e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._insertElement(t,J.HTML),e.skipNextNewLine=!0,e.framesetOk=!1}function zy(e,t){let n=e.openElements.tmplCount>0;(!e.formElement||n)&&(e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._insertElement(t,J.HTML),n||(e.formElement=e.openElements.current))}function By(e,t){e.framesetOk=!1;let n=t.tagID;for(let t=e.openElements.stackTop;t>=0;t--){let r=e.openElements.tagIDs[t];if(n===X.LI&&r===X.LI||(n===X.DD||n===X.DT)&&(r===X.DD||r===X.DT)){e.openElements.generateImpliedEndTagsWithExclusion(r),e.openElements.popUntilTagNamePopped(r);break}if(r!==X.ADDRESS&&r!==X.DIV&&r!==X.P&&e._isSpecialElement(e.openElements.items[t],r))break}e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._insertElement(t,J.HTML)}function Vy(e,t){e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._insertElement(t,J.HTML),e.tokenizer.state=J_.PLAINTEXT}function Hy(e,t){e.openElements.hasInScope(X.BUTTON)&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilTagNamePopped(X.BUTTON)),e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML),e.framesetOk=!1}function Uy(e,t){let n=e.activeFormattingElements.getElementEntryInScopeWithTagName(Y.A);n&&(sy(e,t),e.openElements.remove(n.element),e.activeFormattingElements.removeEntry(n)),e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML),e.activeFormattingElements.pushElement(e.openElements.current,t)}function Wy(e,t){e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML),e.activeFormattingElements.pushElement(e.openElements.current,t)}function Gy(e,t){e._reconstructActiveFormattingElements(),e.openElements.hasInScope(X.NOBR)&&(sy(e,t),e._reconstructActiveFormattingElements()),e._insertElement(t,J.HTML),e.activeFormattingElements.pushElement(e.openElements.current,t)}function Ky(e,t){e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML),e.activeFormattingElements.insertMarker(),e.framesetOk=!1}function qy(e,t){e.treeAdapter.getDocumentMode(e.document)!==U_.QUIRKS&&e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._insertElement(t,J.HTML),e.framesetOk=!1,e.insertionMode=$.IN_TABLE}function Jy(e,t){e._reconstructActiveFormattingElements(),e._appendElement(t,J.HTML),e.framesetOk=!1,t.ackSelfClosing=!0}function Yy(e){let t=D_(e,H_.TYPE);return t!=null&&t.toLowerCase()===Jv}function Xy(e,t){e._reconstructActiveFormattingElements(),e._appendElement(t,J.HTML),Yy(t)||(e.framesetOk=!1),t.ackSelfClosing=!0}function Zy(e,t){e._appendElement(t,J.HTML),t.ackSelfClosing=!0}function Qy(e,t){e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._appendElement(t,J.HTML),e.framesetOk=!1,t.ackSelfClosing=!0}function $y(e,t){t.tagName=Y.IMG,t.tagID=X.IMG,Jy(e,t)}function eb(e,t){e._insertElement(t,J.HTML),e.skipNextNewLine=!0,e.tokenizer.state=J_.RCDATA,e.originalInsertionMode=e.insertionMode,e.framesetOk=!1,e.insertionMode=$.TEXT}function tb(e,t){e.openElements.hasInButtonScope(X.P)&&e._closePElement(),e._reconstructActiveFormattingElements(),e.framesetOk=!1,e._switchToTextParsing(t,J_.RAWTEXT)}function nb(e,t){e.framesetOk=!1,e._switchToTextParsing(t,J_.RAWTEXT)}function rb(e,t){e._switchToTextParsing(t,J_.RAWTEXT)}function ib(e,t){e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML),e.framesetOk=!1,e.insertionMode=e.insertionMode===$.IN_TABLE||e.insertionMode===$.IN_CAPTION||e.insertionMode===$.IN_TABLE_BODY||e.insertionMode===$.IN_ROW||e.insertionMode===$.IN_CELL?$.IN_SELECT_IN_TABLE:$.IN_SELECT}function ab(e,t){e.openElements.currentTagId===X.OPTION&&e.openElements.pop(),e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML)}function ob(e,t){e.openElements.hasInScope(X.RUBY)&&e.openElements.generateImpliedEndTags(),e._insertElement(t,J.HTML)}function sb(e,t){e.openElements.hasInScope(X.RUBY)&&e.openElements.generateImpliedEndTagsWithExclusion(X.RTC),e._insertElement(t,J.HTML)}function cb(e,t){e._reconstructActiveFormattingElements(),Vv(t),Uv(t),t.selfClosing?e._appendElement(t,J.MATHML):e._insertElement(t,J.MATHML),t.ackSelfClosing=!0}function lb(e,t){e._reconstructActiveFormattingElements(),Hv(t),Uv(t),t.selfClosing?e._appendElement(t,J.SVG):e._insertElement(t,J.SVG),t.ackSelfClosing=!0}function ub(e,t){e._reconstructActiveFormattingElements(),e._insertElement(t,J.HTML)}function db(e,t){switch(t.tagID){case X.I:case X.S:case X.B:case X.U:case X.EM:case X.TT:case X.BIG:case X.CODE:case X.FONT:case X.SMALL:case X.STRIKE:case X.STRONG:Wy(e,t);break;case X.A:Uy(e,t);break;case X.H1:case X.H2:case X.H3:case X.H4:case X.H5:case X.H6:Ly(e,t);break;case X.P:case X.DL:case X.OL:case X.UL:case X.DIV:case X.DIR:case X.NAV:case X.MAIN:case X.MENU:case X.ASIDE:case X.CENTER:case X.FIGURE:case X.FOOTER:case X.HEADER:case X.HGROUP:case X.DIALOG:case X.DETAILS:case X.ADDRESS:case X.ARTICLE:case X.SEARCH:case X.SECTION:case X.SUMMARY:case X.FIELDSET:case X.BLOCKQUOTE:case X.FIGCAPTION:Iy(e,t);break;case X.LI:case X.DD:case X.DT:By(e,t);break;case X.BR:case X.IMG:case X.WBR:case X.AREA:case X.EMBED:case X.KEYGEN:Jy(e,t);break;case X.HR:Qy(e,t);break;case X.RB:case X.RTC:ob(e,t);break;case X.RT:case X.RP:sb(e,t);break;case X.PRE:case X.LISTING:Ry(e,t);break;case X.XMP:tb(e,t);break;case X.SVG:lb(e,t);break;case X.HTML:Ny(e,t);break;case X.BASE:case X.LINK:case X.META:case X.STYLE:case X.TITLE:case X.SCRIPT:case X.BGSOUND:case X.BASEFONT:case X.TEMPLATE:by(e,t);break;case X.BODY:Py(e,t);break;case X.FORM:zy(e,t);break;case X.NOBR:Gy(e,t);break;case X.MATH:cb(e,t);break;case X.TABLE:qy(e,t);break;case X.INPUT:Xy(e,t);break;case X.PARAM:case X.TRACK:case X.SOURCE:Zy(e,t);break;case X.IMAGE:$y(e,t);break;case X.BUTTON:Hy(e,t);break;case X.APPLET:case X.OBJECT:case X.MARQUEE:Ky(e,t);break;case X.IFRAME:nb(e,t);break;case X.SELECT:ib(e,t);break;case X.OPTION:case X.OPTGROUP:ab(e,t);break;case X.NOEMBED:case X.NOFRAMES:rb(e,t);break;case X.FRAMESET:Fy(e,t);break;case X.TEXTAREA:eb(e,t);break;case X.NOSCRIPT:e.options.scriptingEnabled?rb(e,t):ub(e,t);break;case X.PLAINTEXT:Vy(e,t);break;case X.COL:case X.TH:case X.TD:case X.TR:case X.HEAD:case X.FRAME:case X.TBODY:case X.TFOOT:case X.THEAD:case X.CAPTION:case X.COLGROUP:break;default:ub(e,t)}}function fb(e,t){if(e.openElements.hasInScope(X.BODY)&&(e.insertionMode=$.AFTER_BODY,e.options.sourceCodeLocationInfo)){let n=e.openElements.tryPeekProperlyNestedBodyElement();n&&e._setEndLocation(n,t)}}function pb(e,t){e.openElements.hasInScope(X.BODY)&&(e.insertionMode=$.AFTER_BODY,cx(e,t))}function mb(e,t){let n=t.tagID;e.openElements.hasInScope(n)&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilTagNamePopped(n))}function hb(e){let t=e.openElements.tmplCount>0,{formElement:n}=e;t||(e.formElement=null),(n||t)&&e.openElements.hasInScope(X.FORM)&&(e.openElements.generateImpliedEndTags(),t?e.openElements.popUntilTagNamePopped(X.FORM):n&&e.openElements.remove(n))}function gb(e){e.openElements.hasInButtonScope(X.P)||e._insertFakeElement(Y.P,X.P),e._closePElement()}function _b(e){e.openElements.hasInListItemScope(X.LI)&&(e.openElements.generateImpliedEndTagsWithExclusion(X.LI),e.openElements.popUntilTagNamePopped(X.LI))}function vb(e,t){let n=t.tagID;e.openElements.hasInScope(n)&&(e.openElements.generateImpliedEndTagsWithExclusion(n),e.openElements.popUntilTagNamePopped(n))}function yb(e){e.openElements.hasNumberedHeaderInScope()&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilNumberedHeaderPopped())}function bb(e,t){let n=t.tagID;e.openElements.hasInScope(n)&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilTagNamePopped(n),e.activeFormattingElements.clearToLastMarker())}function xb(e){e._reconstructActiveFormattingElements(),e._insertFakeElement(Y.BR,X.BR),e.openElements.pop(),e.framesetOk=!1}function Sb(e,t){let n=t.tagName,r=t.tagID;for(let t=e.openElements.stackTop;t>0;t--){let i=e.openElements.items[t],a=e.openElements.tagIDs[t];if(r===a&&(r!==X.UNKNOWN||e.treeAdapter.getTagName(i)===n)){e.openElements.generateImpliedEndTagsWithExclusion(r),e.openElements.stackTop>=t&&e.openElements.shortenToLength(t);break}if(e._isSpecialElement(i,a))break}}function Cb(e,t){switch(t.tagID){case X.A:case X.B:case X.I:case X.S:case X.U:case X.EM:case X.TT:case X.BIG:case X.CODE:case X.FONT:case X.NOBR:case X.SMALL:case X.STRIKE:case X.STRONG:sy(e,t);break;case X.P:gb(e);break;case X.DL:case X.UL:case X.OL:case X.DIR:case X.DIV:case X.NAV:case X.PRE:case X.MAIN:case X.MENU:case X.ASIDE:case X.BUTTON:case X.CENTER:case X.FIGURE:case X.FOOTER:case X.HEADER:case X.HGROUP:case X.DIALOG:case X.ADDRESS:case X.ARTICLE:case X.DETAILS:case X.SEARCH:case X.SECTION:case X.SUMMARY:case X.LISTING:case X.FIELDSET:case X.BLOCKQUOTE:case X.FIGCAPTION:mb(e,t);break;case X.LI:_b(e);break;case X.DD:case X.DT:vb(e,t);break;case X.H1:case X.H2:case X.H3:case X.H4:case X.H5:case X.H6:yb(e);break;case X.BR:xb(e);break;case X.BODY:fb(e,t);break;case X.HTML:pb(e,t);break;case X.FORM:hb(e);break;case X.APPLET:case X.OBJECT:case X.MARQUEE:bb(e,t);break;case X.TEMPLATE:Sy(e,t);break;default:Sb(e,t)}}function wb(e,t){e.tmplInsertionModeStack.length>0?ox(e,t):dy(e,t)}function Tb(e,t){var n;t.tagID===X.SCRIPT&&((n=e.scriptHandler)==null||n.call(e,e.openElements.current)),e.openElements.pop(),e.insertionMode=e.originalInsertionMode}function Eb(e,t){e._err(t,K.eofInElementThatCanContainOnlyText),e.openElements.pop(),e.insertionMode=e.originalInsertionMode,e.onEof(t)}function Db(e,t){if(e.openElements.currentTagId!==void 0&&Qv.has(e.openElements.currentTagId))switch(e.pendingCharacterTokens.length=0,e.hasNonWhitespacePendingCharacterToken=!1,e.originalInsertionMode=e.insertionMode,e.insertionMode=$.IN_TABLE_TEXT,t.type){case q.CHARACTER:Bb(e,t);break;case q.WHITESPACE_CHARACTER:zb(e,t)}else Rb(e,t)}function Ob(e,t){e.openElements.clearBackToTableContext(),e.activeFormattingElements.insertMarker(),e._insertElement(t,J.HTML),e.insertionMode=$.IN_CAPTION}function kb(e,t){e.openElements.clearBackToTableContext(),e._insertElement(t,J.HTML),e.insertionMode=$.IN_COLUMN_GROUP}function Ab(e,t){e.openElements.clearBackToTableContext(),e._insertFakeElement(Y.COLGROUP,X.COLGROUP),e.insertionMode=$.IN_COLUMN_GROUP,Gb(e,t)}function jb(e,t){e.openElements.clearBackToTableContext(),e._insertElement(t,J.HTML),e.insertionMode=$.IN_TABLE_BODY}function Mb(e,t){e.openElements.clearBackToTableContext(),e._insertFakeElement(Y.TBODY,X.TBODY),e.insertionMode=$.IN_TABLE_BODY,Jb(e,t)}function Nb(e,t){e.openElements.hasInTableScope(X.TABLE)&&(e.openElements.popUntilTagNamePopped(X.TABLE),e._resetInsertionMode(),e._processStartTag(t))}function Pb(e,t){Yy(t)?e._appendElement(t,J.HTML):Rb(e,t),t.ackSelfClosing=!0}function Fb(e,t){!e.formElement&&e.openElements.tmplCount===0&&(e._insertElement(t,J.HTML),e.formElement=e.openElements.current,e.openElements.pop())}function Ib(e,t){switch(t.tagID){case X.TD:case X.TH:case X.TR:Mb(e,t);break;case X.STYLE:case X.SCRIPT:case X.TEMPLATE:by(e,t);break;case X.COL:Ab(e,t);break;case X.FORM:Fb(e,t);break;case X.TABLE:Nb(e,t);break;case X.TBODY:case X.TFOOT:case X.THEAD:jb(e,t);break;case X.INPUT:Pb(e,t);break;case X.CAPTION:Ob(e,t);break;case X.COLGROUP:kb(e,t);break;default:Rb(e,t)}}function Lb(e,t){switch(t.tagID){case X.TABLE:e.openElements.hasInTableScope(X.TABLE)&&(e.openElements.popUntilTagNamePopped(X.TABLE),e._resetInsertionMode());break;case X.TEMPLATE:Sy(e,t);break;case X.BODY:case X.CAPTION:case X.COL:case X.COLGROUP:case X.HTML:case X.TBODY:case X.TD:case X.TFOOT:case X.TH:case X.THEAD:case X.TR:break;default:Rb(e,t)}}function Rb(e,t){let n=e.fosterParentingEnabled;e.fosterParentingEnabled=!0,Ay(e,t),e.fosterParentingEnabled=n}function zb(e,t){e.pendingCharacterTokens.push(t)}function Bb(e,t){e.pendingCharacterTokens.push(t),e.hasNonWhitespacePendingCharacterToken=!0}function Vb(e,t){let n=0;if(e.hasNonWhitespacePendingCharacterToken)for(;n<e.pendingCharacterTokens.length;n++)Rb(e,e.pendingCharacterTokens[n]);else for(;n<e.pendingCharacterTokens.length;n++)e._insertCharacters(e.pendingCharacterTokens[n]);e.insertionMode=e.originalInsertionMode,e._processToken(t)}var Hb=new Set([X.CAPTION,X.COL,X.COLGROUP,X.TBODY,X.TD,X.TFOOT,X.TH,X.THEAD,X.TR]);function Ub(e,t){let n=t.tagID;Hb.has(n)?e.openElements.hasInTableScope(X.CAPTION)&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilTagNamePopped(X.CAPTION),e.activeFormattingElements.clearToLastMarker(),e.insertionMode=$.IN_TABLE,Ib(e,t)):db(e,t)}function Wb(e,t){let n=t.tagID;switch(n){case X.CAPTION:case X.TABLE:e.openElements.hasInTableScope(X.CAPTION)&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilTagNamePopped(X.CAPTION),e.activeFormattingElements.clearToLastMarker(),e.insertionMode=$.IN_TABLE,n===X.TABLE&&Lb(e,t));break;case X.BODY:case X.COL:case X.COLGROUP:case X.HTML:case X.TBODY:case X.TD:case X.TFOOT:case X.TH:case X.THEAD:case X.TR:break;default:Cb(e,t)}}function Gb(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.COL:e._appendElement(t,J.HTML),t.ackSelfClosing=!0;break;case X.TEMPLATE:by(e,t);break;default:qb(e,t)}}function Kb(e,t){switch(t.tagID){case X.COLGROUP:e.openElements.currentTagId===X.COLGROUP&&(e.openElements.pop(),e.insertionMode=$.IN_TABLE);break;case X.TEMPLATE:Sy(e,t);break;case X.COL:break;default:qb(e,t)}}function qb(e,t){e.openElements.currentTagId===X.COLGROUP&&(e.openElements.pop(),e.insertionMode=$.IN_TABLE,e._processToken(t))}function Jb(e,t){switch(t.tagID){case X.TR:e.openElements.clearBackToTableBodyContext(),e._insertElement(t,J.HTML),e.insertionMode=$.IN_ROW;break;case X.TH:case X.TD:e.openElements.clearBackToTableBodyContext(),e._insertFakeElement(Y.TR,X.TR),e.insertionMode=$.IN_ROW,Xb(e,t);break;case X.CAPTION:case X.COL:case X.COLGROUP:case X.TBODY:case X.TFOOT:case X.THEAD:e.openElements.hasTableBodyContextInTableScope()&&(e.openElements.clearBackToTableBodyContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE,Ib(e,t));break;default:Ib(e,t)}}function Yb(e,t){let n=t.tagID;switch(t.tagID){case X.TBODY:case X.TFOOT:case X.THEAD:e.openElements.hasInTableScope(n)&&(e.openElements.clearBackToTableBodyContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE);break;case X.TABLE:e.openElements.hasTableBodyContextInTableScope()&&(e.openElements.clearBackToTableBodyContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE,Lb(e,t));break;case X.BODY:case X.CAPTION:case X.COL:case X.COLGROUP:case X.HTML:case X.TD:case X.TH:case X.TR:break;default:Lb(e,t)}}function Xb(e,t){switch(t.tagID){case X.TH:case X.TD:e.openElements.clearBackToTableRowContext(),e._insertElement(t,J.HTML),e.insertionMode=$.IN_CELL,e.activeFormattingElements.insertMarker();break;case X.CAPTION:case X.COL:case X.COLGROUP:case X.TBODY:case X.TFOOT:case X.THEAD:case X.TR:e.openElements.hasInTableScope(X.TR)&&(e.openElements.clearBackToTableRowContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE_BODY,Jb(e,t));break;default:Ib(e,t)}}function Zb(e,t){switch(t.tagID){case X.TR:e.openElements.hasInTableScope(X.TR)&&(e.openElements.clearBackToTableRowContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE_BODY);break;case X.TABLE:e.openElements.hasInTableScope(X.TR)&&(e.openElements.clearBackToTableRowContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE_BODY,Yb(e,t));break;case X.TBODY:case X.TFOOT:case X.THEAD:(e.openElements.hasInTableScope(t.tagID)||e.openElements.hasInTableScope(X.TR))&&(e.openElements.clearBackToTableRowContext(),e.openElements.pop(),e.insertionMode=$.IN_TABLE_BODY,Yb(e,t));break;case X.BODY:case X.CAPTION:case X.COL:case X.COLGROUP:case X.HTML:case X.TD:case X.TH:break;default:Lb(e,t)}}function Qb(e,t){let n=t.tagID;Hb.has(n)?(e.openElements.hasInTableScope(X.TD)||e.openElements.hasInTableScope(X.TH))&&(e._closeTableCell(),Xb(e,t)):db(e,t)}function $b(e,t){let n=t.tagID;switch(n){case X.TD:case X.TH:e.openElements.hasInTableScope(n)&&(e.openElements.generateImpliedEndTags(),e.openElements.popUntilTagNamePopped(n),e.activeFormattingElements.clearToLastMarker(),e.insertionMode=$.IN_ROW);break;case X.TABLE:case X.TBODY:case X.TFOOT:case X.THEAD:case X.TR:e.openElements.hasInTableScope(n)&&(e._closeTableCell(),Zb(e,t));break;case X.BODY:case X.CAPTION:case X.COL:case X.COLGROUP:case X.HTML:break;default:Cb(e,t)}}function ex(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.OPTION:e.openElements.currentTagId===X.OPTION&&e.openElements.pop(),e._insertElement(t,J.HTML);break;case X.OPTGROUP:e.openElements.currentTagId===X.OPTION&&e.openElements.pop(),e.openElements.currentTagId===X.OPTGROUP&&e.openElements.pop(),e._insertElement(t,J.HTML);break;case X.HR:e.openElements.currentTagId===X.OPTION&&e.openElements.pop(),e.openElements.currentTagId===X.OPTGROUP&&e.openElements.pop(),e._appendElement(t,J.HTML),t.ackSelfClosing=!0;break;case X.INPUT:case X.KEYGEN:case X.TEXTAREA:case X.SELECT:e.openElements.hasInSelectScope(X.SELECT)&&(e.openElements.popUntilTagNamePopped(X.SELECT),e._resetInsertionMode(),t.tagID!==X.SELECT&&e._processStartTag(t));break;case X.SCRIPT:case X.TEMPLATE:by(e,t)}}function tx(e,t){switch(t.tagID){case X.OPTGROUP:e.openElements.stackTop>0&&e.openElements.currentTagId===X.OPTION&&e.openElements.tagIDs[e.openElements.stackTop-1]===X.OPTGROUP&&e.openElements.pop(),e.openElements.currentTagId===X.OPTGROUP&&e.openElements.pop();break;case X.OPTION:e.openElements.currentTagId===X.OPTION&&e.openElements.pop();break;case X.SELECT:e.openElements.hasInSelectScope(X.SELECT)&&(e.openElements.popUntilTagNamePopped(X.SELECT),e._resetInsertionMode());break;case X.TEMPLATE:Sy(e,t)}}function nx(e,t){let n=t.tagID;n===X.CAPTION||n===X.TABLE||n===X.TBODY||n===X.TFOOT||n===X.THEAD||n===X.TR||n===X.TD||n===X.TH?(e.openElements.popUntilTagNamePopped(X.SELECT),e._resetInsertionMode(),e._processStartTag(t)):ex(e,t)}function rx(e,t){let n=t.tagID;n===X.CAPTION||n===X.TABLE||n===X.TBODY||n===X.TFOOT||n===X.THEAD||n===X.TR||n===X.TD||n===X.TH?e.openElements.hasInTableScope(n)&&(e.openElements.popUntilTagNamePopped(X.SELECT),e._resetInsertionMode(),e.onEndTag(t)):tx(e,t)}function ix(e,t){switch(t.tagID){case X.BASE:case X.BASEFONT:case X.BGSOUND:case X.LINK:case X.META:case X.NOFRAMES:case X.SCRIPT:case X.STYLE:case X.TEMPLATE:case X.TITLE:by(e,t);break;case X.CAPTION:case X.COLGROUP:case X.TBODY:case X.TFOOT:case X.THEAD:e.tmplInsertionModeStack[0]=$.IN_TABLE,e.insertionMode=$.IN_TABLE,Ib(e,t);break;case X.COL:e.tmplInsertionModeStack[0]=$.IN_COLUMN_GROUP,e.insertionMode=$.IN_COLUMN_GROUP,Gb(e,t);break;case X.TR:e.tmplInsertionModeStack[0]=$.IN_TABLE_BODY,e.insertionMode=$.IN_TABLE_BODY,Jb(e,t);break;case X.TD:case X.TH:e.tmplInsertionModeStack[0]=$.IN_ROW,e.insertionMode=$.IN_ROW,Xb(e,t);break;default:e.tmplInsertionModeStack[0]=$.IN_BODY,e.insertionMode=$.IN_BODY,db(e,t)}}function ax(e,t){t.tagID===X.TEMPLATE&&Sy(e,t)}function ox(e,t){e.openElements.tmplCount>0?(e.openElements.popUntilTagNamePopped(X.TEMPLATE),e.activeFormattingElements.clearToLastMarker(),e.tmplInsertionModeStack.shift(),e._resetInsertionMode(),e.onEof(t)):dy(e,t)}function sx(e,t){t.tagID===X.HTML?db(e,t):lx(e,t)}function cx(e,t){if(t.tagID===X.HTML){if(e.fragmentContext||(e.insertionMode=$.AFTER_AFTER_BODY),e.options.sourceCodeLocationInfo&&e.openElements.tagIDs[0]===X.HTML){e._setEndLocation(e.openElements.items[0],t);let n=e.openElements.items[1];n&&!e.treeAdapter.getNodeSourceCodeLocation(n)?.endTag&&e._setEndLocation(n,t)}}else lx(e,t)}function lx(e,t){e.insertionMode=$.IN_BODY,Ay(e,t)}function ux(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.FRAMESET:e._insertElement(t,J.HTML);break;case X.FRAME:e._appendElement(t,J.HTML),t.ackSelfClosing=!0;break;case X.NOFRAMES:by(e,t)}}function dx(e,t){t.tagID===X.FRAMESET&&!e.openElements.isRootHtmlElementCurrent()&&(e.openElements.pop(),!e.fragmentContext&&e.openElements.currentTagId!==X.FRAMESET&&(e.insertionMode=$.AFTER_FRAMESET))}function fx(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.NOFRAMES:by(e,t)}}function px(e,t){t.tagID===X.HTML&&(e.insertionMode=$.AFTER_AFTER_FRAMESET)}function mx(e,t){t.tagID===X.HTML?db(e,t):hx(e,t)}function hx(e,t){e.insertionMode=$.IN_BODY,Ay(e,t)}function gx(e,t){switch(t.tagID){case X.HTML:db(e,t);break;case X.NOFRAMES:by(e,t)}}function _x(e,t){t.chars=`�`,e._insertCharacters(t)}function vx(e,t){e._insertCharacters(t),e.framesetOk=!1}function yx(e){for(;e.treeAdapter.getNamespaceURI(e.openElements.current)!==J.HTML&&e.openElements.currentTagId!==void 0&&!e._isIntegrationPoint(e.openElements.currentTagId,e.openElements.current);)e.openElements.pop()}function bx(e,t){if(Bv(t))yx(e),e._startTagOutsideForeignContent(t);else{let n=e._getAdjustedCurrentElement(),r=e.treeAdapter.getNamespaceURI(n);r===J.MATHML?Vv(t):r===J.SVG&&(Wv(t),Hv(t)),Uv(t),t.selfClosing?e._appendElement(t,r):e._insertElement(t,r),t.ackSelfClosing=!0}}function xx(e,t){if(t.tagID===X.P||t.tagID===X.BR){yx(e),e._endTagOutsideForeignContent(t);return}for(let n=e.openElements.stackTop;n>0;n--){let r=e.openElements.items[n];if(e.treeAdapter.getNamespaceURI(r)===J.HTML){e._endTagOutsideForeignContent(t);break}let i=e.treeAdapter.getTagName(r);if(i.toLowerCase()===t.tagName){t.tagName=i,e.openElements.shortenToLength(n);break}}}Y.AREA,Y.BASE,Y.BASEFONT,Y.BGSOUND,Y.BR,Y.COL,Y.EMBED,Y.FRAME,Y.HR,Y.IMG,Y.INPUT,Y.KEYGEN,Y.LINK,Y.META,Y.PARAM,Y.SOURCE,Y.TRACK,Y.WBR;var Sx=/<(\/?)(iframe|noembed|noframes|plaintext|script|style|textarea|title|xmp)(?=[\t\n\f\r />])/gi,Cx=new Set([`mdxFlowExpression`,`mdxJsxFlowElement`,`mdxJsxTextElement`,`mdxTextExpression`,`mdxjsEsm`]),wx={sourceCodeLocationInfo:!0,scriptingEnabled:!1};function Tx(e,t){let n=zx(e),r=Tm(`type`,{handlers:{root:Dx,element:Ox,text:kx,comment:Mx,doctype:Ax,raw:Nx},unknown:Px}),i={parser:n?new ey(wx):ey.getFragmentParser(void 0,wx),handle(e){r(e,i)},stitches:!1,options:t||{}};r(e,i),Fx(i,Ks());let a=Xg(n?i.parser.document:i.parser.getFragment(),{file:i.options.file});return i.stitches&&Of(a,`comment`,function(e,t,n){let r=e;if(r.value.stitch&&n&&t!==void 0){let e=n.children;return e[t]=r.value.stitch,t}}),a.type===`root`&&a.children.length===1&&a.children[0].type===e.type?a.children[0]:a}function Ex(e,t){let n=-1;if(e)for(;++n<e.length;)t.handle(e[n])}function Dx(e,t){Ex(e.children,t)}function Ox(e,t){Lx(e,t),Ex(e.children,t),Rx(e,t)}function kx(e,t){t.parser.tokenizer.state>4&&(t.parser.tokenizer.state=0);let n={type:q.CHARACTER,chars:e.value,location:Bx(e)};Fx(t,Ks(e)),t.parser.currentToken=n,t.parser._processToken(t.parser.currentToken)}function Ax(e,t){let n={type:q.DOCTYPE,name:`html`,forceQuirks:!1,publicId:``,systemId:``,location:Bx(e)};Fx(t,Ks(e)),t.parser.currentToken=n,t.parser._processToken(t.parser.currentToken)}function jx(e,t){t.stitches=!0;let n=Vx(e);`children`in e&&`children`in n&&(n.children=Tx({type:`root`,children:e.children},t.options).children),Mx({type:`comment`,value:{stitch:n}},t)}function Mx(e,t){let n=e.value,r={type:q.COMMENT,data:n,location:Bx(e)};Fx(t,Ks(e)),t.parser.currentToken=r,t.parser._processToken(t.parser.currentToken)}function Nx(e,t){if(t.parser.tokenizer.preprocessor.html=``,t.parser.tokenizer.preprocessor.pos=-1,t.parser.tokenizer.preprocessor.lastGapPos=-2,t.parser.tokenizer.preprocessor.gapStack=[],t.parser.tokenizer.preprocessor.skipNextNewLine=!1,t.parser.tokenizer.preprocessor.lastChunkWritten=!1,t.parser.tokenizer.preprocessor.endOfChunkHit=!1,t.parser.tokenizer.preprocessor.isEol=!1,Ix(t,Ks(e)),t.parser.tokenizer.write(t.options.tagfilter?e.value.replace(Sx,`&lt;$1$2`):e.value,!1),t.parser.tokenizer._runParsingLoop(),t.parser.tokenizer.state===72||t.parser.tokenizer.state===78){t.parser.tokenizer.preprocessor.lastChunkWritten=!0;let e=t.parser.tokenizer._consume();t.parser.tokenizer._callState(e)}}function Px(e,t){let n=e;if(t.options.passThrough&&t.options.passThrough.includes(n.type))jx(n,t);else{let e=``;throw Cx.has(n.type)&&(e=". It looks like you are using MDX nodes with `hast-util-raw` (or `rehype-raw`). If you use this because you are using remark or rehype plugins that inject `'html'` nodes, then please raise an issue with that plugin, as its a bad and slow idea. If you use this because you are using markdown syntax, then you have to configure this utility (or plugin) to pass through these nodes (see `passThrough` in docs), but you can also migrate to use the MDX syntax"),Error("Cannot compile `"+n.type+"` node"+e)}}function Fx(e,t){Ix(e,t);let n=e.parser.tokenizer.currentCharacterToken;n&&n.location&&(n.location.endLine=e.parser.tokenizer.preprocessor.line,n.location.endCol=e.parser.tokenizer.preprocessor.col+1,n.location.endOffset=e.parser.tokenizer.preprocessor.offset+1,e.parser.currentToken=n,e.parser._processToken(e.parser.currentToken)),e.parser.tokenizer.paused=!1,e.parser.tokenizer.inLoop=!1,e.parser.tokenizer.active=!1,e.parser.tokenizer.returnState=J_.DATA,e.parser.tokenizer.charRefCode=-1,e.parser.tokenizer.consumedAfterSnapshot=-1,e.parser.tokenizer.currentLocation=null,e.parser.tokenizer.currentCharacterToken=null,e.parser.tokenizer.currentToken=null,e.parser.tokenizer.currentAttr={name:``,value:``}}function Ix(e,t){if(t&&t.offset!==void 0){let n={startLine:t.line,startCol:t.column,startOffset:t.offset,endLine:-1,endCol:-1,endOffset:-1};e.parser.tokenizer.preprocessor.lineStartPos=-t.column+1,e.parser.tokenizer.preprocessor.droppedBufferSize=t.offset,e.parser.tokenizer.preprocessor.line=t.line,e.parser.tokenizer.currentLocation=n}}function Lx(e,t){let n=e.tagName.toLowerCase();if(t.parser.tokenizer.state===J_.PLAINTEXT)return;Fx(t,Ks(e));let r=t.parser.openElements.current,i=`namespaceURI`in r?r.namespaceURI:qg.html;i===qg.html&&n===`svg`&&(i=qg.svg);let a=s_({...e,children:[]},{space:i===qg.svg?`svg`:`html`}),o={type:q.START_TAG,tagName:n,tagID:G_(n),selfClosing:!1,ackSelfClosing:!1,attrs:`attrs`in a?a.attrs:[],location:Bx(e)};t.parser.currentToken=o,t.parser._processToken(t.parser.currentToken),t.parser.tokenizer.lastStartTagName=n}function Rx(e,t){let n=e.tagName.toLowerCase();if(!t.parser.tokenizer.inForeignNode&&__.includes(n)||t.parser.tokenizer.state===J_.PLAINTEXT)return;Fx(t,Gs(e));let r={type:q.END_TAG,tagName:n,tagID:G_(n),selfClosing:!1,ackSelfClosing:!1,attrs:[],location:Bx(e)};t.parser.currentToken=r,t.parser._processToken(t.parser.currentToken),n===t.parser.tokenizer.lastStartTagName&&(t.parser.tokenizer.state===J_.RCDATA||t.parser.tokenizer.state===J_.RAWTEXT||t.parser.tokenizer.state===J_.SCRIPT_DATA)&&(t.parser.tokenizer.state=J_.DATA)}function zx(e){let t=e.type===`root`?e.children[0]:e;return!!(t&&(t.type===`doctype`||t.type===`element`&&t.tagName.toLowerCase()===`html`))}function Bx(e){let t=Ks(e)||{line:void 0,column:void 0,offset:void 0},n=Gs(e)||{line:void 0,column:void 0,offset:void 0};return{startLine:t.line,startCol:t.column,startOffset:t.offset,endLine:n.line,endCol:n.column,endOffset:n.offset}}function Vx(e){return`children`in e?pf({...e,children:[]}):pf(e)}function Hx(e){return function(t,n){return Tx(t,{...e,file:n})}}function Ux(e){return!!e&&e.startsWith(`/`)&&!e.startsWith(`//`)}function Wx(e){return e==null||typeof e==`boolean`?``:typeof e==`string`||typeof e==`number`?String(e):Array.isArray(e)?e.map(Wx).join(``):typeof e==`object`&&`props`in e?Wx(e.props?.children):``}function Gx(e){return e.trim().toLowerCase().replace(/[\s/_]+/g,`-`).replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af-]+/g,``).replace(/-+/g,`-`).replace(/^-|-$/g,``)||`section`}function Kx(){let e=new Map;function t(t){let n=Gx(t),r=e.get(n)??0;return e.set(n,r+1),r===0?n:`${n}-${r+1}`}function n(e){return function({children:n}){let r=t(Wx(n));return(0,P.jsx)(e,{id:r,children:n})}}return{h1:n(`h1`),h2:n(`h2`),h3:n(`h3`),h4:n(`h4`)}}function qx({markdown:e,className:t}){let n=(0,S.useMemo)(()=>({...Kx(),a({href:e,children:t}){return Ux(e)?(0,P.jsx)(jn,{to:e,children:t}):(0,P.jsx)(`a`,{href:e,target:`_blank`,rel:`noopener noreferrer`,children:t})},img({src:e,alt:t,...n}){let r=e&&e.startsWith(`/`)?Oo(e):e;return(0,P.jsx)(`img`,{src:r,alt:t??``,...n})}}),[e]);return(0,P.jsx)(`div`,{className:t,children:(0,P.jsx)(Ep,{remarkPlugins:[Mg],rehypePlugins:[Hx],components:n,children:e})})}function Jx(){let{pathname:e}=pt(),{t,i18n:n}=li(),r=Fo(e),i=Bi(n.resolvedLanguage||n.language),a=Lo(r,i),o=Ro(r);return(0,S.useEffect)(()=>{let e=o?t(`pages.${o.pageKey}`):null;document.title=e?`${e} · ${t(`docTitleSuffix`)}`:t(`docTitleSuffix`)},[o,t,n.language]),a?(0,P.jsx)(qx,{className:`docs-article`,markdown:a},`${i}:${r}`):(0,P.jsx)(Vt,{to:`/guide/getting-started`,replace:!0})}function Yx(){let{pathname:e}=pt(),{t,i18n:n}=li(),r=Fo(e),i=Bi(n.resolvedLanguage||n.language),a=Lo(r,i),o=zo(r);return(0,S.useEffect)(()=>{let e=o?t(`pages.${o}`):null;document.title=e?`${e} · recombyn`:`recombyn`},[o,t,n.language]),a?(0,P.jsx)(qx,{className:`legal-article`,markdown:a},`${i}:${r}`):(0,P.jsx)(Vt,{to:`/legal/terms`,replace:!0})}function Xx(){return(0,P.jsxs)(Gt,{children:[(0,P.jsx)(Ut,{path:`/`,element:(0,P.jsx)(Vt,{to:`/guide/getting-started`,replace:!0})}),(0,P.jsxs)(Ut,{element:(0,P.jsx)(Yo,{}),children:[(0,P.jsx)(Ut,{path:`/guide/:slug`,element:(0,P.jsx)(Jx,{})}),(0,P.jsx)(Ut,{path:`/features/import-fonts`,element:(0,P.jsx)(Vt,{to:`/features/import`,replace:!0})}),(0,P.jsx)(Ut,{path:`/features/:slug`,element:(0,P.jsx)(Jx,{})}),(0,P.jsx)(Ut,{path:`/faq`,element:(0,P.jsx)(Vt,{to:`/faq/`,replace:!0})}),(0,P.jsx)(Ut,{path:`/faq/`,element:(0,P.jsx)(Jx,{})}),(0,P.jsx)(Ut,{path:`/sponsor`,element:(0,P.jsx)(Jx,{})})]}),(0,P.jsxs)(Ut,{path:`/legal`,element:(0,P.jsx)(Xo,{}),children:[(0,P.jsx)(Ut,{index:!0,element:(0,P.jsx)(Vt,{to:`/legal/terms`,replace:!0})}),(0,P.jsx)(Ut,{path:`:slug`,element:(0,P.jsx)(Yx,{})})]}),(0,P.jsx)(Ut,{path:`*`,element:(0,P.jsx)(Vt,{to:`/guide/getting-started`,replace:!0})})]})}var Zx=`/recombyn/`.replace(/\/$/,``)||void 0;(0,Hn.createRoot)(document.getElementById(`root`)).render((0,P.jsx)(S.StrictMode,{children:(0,P.jsx)(An,{basename:Zx,children:(0,P.jsx)(Xx,{})})}));