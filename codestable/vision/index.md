# Vision

Element Call aims to let people start and join secure, decentralised video and
voice conversations in Matrix rooms, whether they arrive through a standalone
web app, a Matrix messenger, or a host application. It is the MatrixRTC
reference implementation: Matrix supplies identity, rooms and federation while
LiveKit provides the conferencing transport.

## How people should get a call

- **Meet in a Matrix room** — a person opens a room-specific call link or a
  room’s call surface, prepares devices in the lobby when needed, then joins a
  shared audio/video conversation. Calls should remain useful across Matrix
  homeservers rather than belonging to one central provider.
- **Call from a messenger** — Element Web and Element X can place the calling
  experience inside their own room UI. The messenger retains its account,
  room-state and event responsibilities; Element Call focuses on MatrixRTC
  calling.
- **Host calls in another product** — a React host can render the call in its
  own page and retain control of its Matrix client, room, theme, language and
  lifecycle. This component integration is experimental.
- **Operate a deployment** — an administrator can self-host the web app and
  provide a MatrixRTC transport so their Matrix users can discover and use a
  conferencing backend.

## Capabilities that support those journeys

- **Matrix-native call coordination** connects room membership and transport
  discovery to a LiveKit-backed WebRTC session.
- **Conversation controls** provide the in-call interactions needed for a
  meeting, including device media, screen sharing, hand raising and emoji
  reactions.
- **Embeddable presentation** gives standalone, widget, embedded-package and
  experimental component/SDK consumers ways to use the same calling core
  without making the host page or session Element Call’s responsibility.
- **Accessible, localised call UI** can adapt its language, theme and container
  to its host context rather than assuming it owns a browser page.

## Product boundaries and directions

- A Matrix home server and a discoverable MatrixRTC transport are part of a
  working deployment; Element Call is not the identity provider or the
  conferencing-service operator.
- Privacy and federation are product requirements. A host must make any
  analytics decision appropriate to its deployment and user consent.
- MatrixRTC membership is transitioning from state events to sticky events.
  `matrix_2_0` is the target mode where a deployment and its clients support
  it; compatibility mode keeps today’s broader homeserver support.
- The React component and SDK forms are experimental. The embedded package is
  the recommended way to integrate Element Call as a widget in messenger apps.

## Current reality and reading paths

- To understand what can be used and the constraints it currently has, read
  the [Project Spec](../spec/index.md).
- To embed Element Call in a Matrix client, read
  [Embedded vs standalone mode](../../docs/embedded_standalone.md).
- To run a deployment and provide its transport, read the
  [self-hosting guide](../../docs/self_hosting.md).
- To track MatrixRTC-mode compatibility, read
  [MatrixRTC modes](../../docs/matrix_rtc_modes.md).

**Terms:** _MatrixRTC_ is the Matrix protocol layer for real-time calls;
_transport_ is the conferencing backend a client discovers; _widget_ is Element
Call embedded in a Matrix client; _host_ is an application that embeds the
widget or React component.
