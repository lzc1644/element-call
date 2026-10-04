# Project Spec

Element Call is a React application and set of packages for MatrixRTC video and
voice calls backed by LiveKit. Today it ships as a standalone web app, a
widget-capable full package, a widget-only embedded package, and an experimental
React component; an experimental SDK build exposes the calling view model to
simple web applications. The same calling core must work when it owns the page
and when a host owns the page, Matrix client and surrounding UI.

## Start and join a call

A standalone deployment gives people a homepage, login/registration routes and
room routes. A shareable room link identifies the Matrix room; its sensitive
call parameters live in the URL fragment so they are not sent to the Element
Call server. Before the app renders a call, it requires a secure browser context
and WebRTC media-device support.

In widget mode, a Matrix client supplies the user and room context over the
widget API. Element Call waits for that client and then presents the core
MatrixRTC call flow; authentication, room-state updates and the surrounding
messenger experience remain the host client’s job. An `intent` selects the
calling defaults, such as starting or joining a group, direct-message, voice or
video call.

Once a participant joins, Element Call discovers MatrixRTC transports from the
homeserver, publishes the participant’s available transport and joins the
LiveKit service selected for the call. In the usual LiveKit flow, the first
participant’s preferred focus selects the backend and the MatrixRTC
Authorisation Service provides a WebSocket URL and access token.

## Use the appropriate integration surface

| Need                                                   | Current surface                    | Responsibility boundary                                                                |
| ------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Run a complete web app or URL-addressable widget       | Full package                       | Standalone owns its Matrix connection; widget mode receives it from the host.          |
| Include calling assets in a Matrix messenger           | Embedded package                   | Widget-only; the messenger owns authentication, room state and consent.                |
| Render a call directly in an existing React page       | Component package _(experimental)_ | The host supplies an existing Matrix client, room, configuration and lifecycle bridge. |
| Use MatrixRTC/LiveKit behaviours from a simple web app | SDK build _(experimental)_         | The host integrates the exposed view-model behaviours and methods.                     |

The component is deliberately confined to its supplied container: its styles,
keyboard shortcuts and portal targets do not claim the host document. Hosts can
provide a theme and language, receive lifecycle events through a host bridge,
and issue join, hang-up and device-mute requests through the component handle.

## Current architecture

Call state and effects live in observable view models under `src/state/`; React
components render snapshots and invoke actions. Observable scopes define the
lifetime of subscriptions and resources. The app shell supplies standalone or
widget-specific concerns through providers, while the component build supplies
the same concepts as explicit host inputs.

This separation is a compatibility constraint, not just an implementation
preference: new call logic and views must not read the global page, infer their
host context, or let one mounted call instance interfere with another. Build
targets cover full, embedded, SDK and component outputs, so an implementation
that works in only one target is incomplete.

## Boundaries and long-lived constraints

- **Federation and interoperability:** compatibility mode is the default while
  homeservers adopt sticky MatrixRTC events. `matrix_2_0` uses sticky events and
  requires MSC4354 support; deployments can pin either valid mode in
  configuration.
- **Information security:** call setup depends on Matrix rooms and configured
  encryption behaviour. The deprecated path-only room URL is unencrypted and
  unsafe; new standalone links use room IDs and fragment parameters instead.
- **Host ownership:** widget and component hosts retain their Matrix session and
  page. Element Call communicates with the host through the widget API or host
  bridge rather than ambient browser globals.
- **Telemetry and compliance:** standalone deployments present their own
  analytics-consent UI. Embedded deployments only receive analytics parameters
  when the messenger host has obtained consent.
- **Deployment:** a usable deployment needs a Matrix homeserver plus a
  discoverable MatrixRTC transport, commonly a LiveKit service reached through
  the MatrixRTC Authorisation Service.

## Evidence and reading paths

- First-time project overview and packaging:
  [README](../../README.md) and
  [Embedded vs standalone mode](../../docs/embedded_standalone.md).
- Configure a link or widget contract:
  [URL parameters](../../docs/url_params.md).
- Understand the current MatrixRTC transition:
  [MatrixRTC modes](../../docs/matrix_rtc_modes.md).
- Modify call code without breaking an integration target:
  [architecture guide](../../docs/agents/architecture.md).
- Operate a deployment:
  [self-hosting guide](../../docs/self_hosting.md).

**Terms:** _full package_ supports standalone and widget modes; _embedded
package_ supports widget mode only; _host bridge_ is the explicit contract
between Element Call and an embedding application; _MatrixRTC mode_ selects the
membership-event and token-endpoint compatibility strategy.
