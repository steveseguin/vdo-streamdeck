import { describe, expect, it } from "vitest";
import {
	buildGuestCommandPayload,
	buildGuestScenePayload,
	buildLocalControlPayload,
	buildLocalMomentaryPayload,
	buildMixerControlPayloads,
	buildPtzDialPayloads,
	buildPtzDialPushPayloads,
	buildPtzKeyPayloads,
	buildValueDialPayload,
	GUEST_COMMANDS,
	LOCAL_CONTROLS,
	nextValueDialValue,
	getGuestCommandDefinition,
	getLocalControlDefinition
} from "./command-registry.js";

describe("command registry", () => {
	it("builds a payload for every local control exposed by the plugin", () => {
		for (const definition of Object.values(LOCAL_CONTROLS)) {
			expect(() => buildLocalControlPayload({ command: definition.id, behavior: "toggle" }), definition.id).not.toThrow();
			expect(buildLocalControlPayload({ command: definition.id, behavior: "toggle" }).action).toBe(definition.action);
		}
	});

	it("builds a payload for every guest command exposed by the plugin", () => {
		for (const definition of Object.values(GUEST_COMMANDS)) {
			expect(() => buildGuestCommandPayload({ command: definition.id, behavior: "toggle" }, "guest123"), definition.id).not.toThrow();
			expect(buildGuestCommandPayload({ command: definition.id, behavior: "toggle" }, "guest123").action).toBe(definition.action);
		}
	});

	it("defaults to mic for unknown local controls", () => {
		expect(getLocalControlDefinition("missing").action).toBe("mic");
	});

	it("builds toggle payloads for normal controls", () => {
		expect(buildLocalControlPayload({ command: "camera", behavior: "toggle" })).toEqual({
			action: "camera",
			value: "toggle"
		});
	});

	it("omits values for press-only controls", () => {
		expect(buildLocalControlPayload({ command: "screenshare", behavior: "toggle" })).toEqual({
			action: "togglescreenshare"
		});
	});

	it("maps record toggle to start because VDO record has no toggle command", () => {
		expect(buildLocalControlPayload({ command: "record", behavior: "toggle" })).toEqual({
			action: "record",
			value: true
		});
	});

	it("builds push-to-talk local mic payloads", () => {
		expect(buildLocalMomentaryPayload({ command: "mic", behavior: "pushToTalk" }, "down")).toEqual({
			action: "mic",
			value: true
		});
		expect(buildLocalMomentaryPayload({ command: "mic", behavior: "pushToTalk" }, "up")).toEqual({
			action: "mic",
			value: false
		});
	});

	it("builds push-to-mute local mic payloads", () => {
		expect(buildLocalMomentaryPayload({ command: "mic", behavior: "pushToMute" }, "down")).toEqual({
			action: "mic",
			value: false
		});
		expect(buildLocalMomentaryPayload({ command: "mic", behavior: "pushToMute" }, "up")).toEqual({
			action: "mic",
			value: true
		});
	});

	it("rejects momentary payloads for non-mic local controls", () => {
		expect(() => buildLocalMomentaryPayload({ command: "camera", behavior: "pushToTalk" }, "down")).toThrow("mic only");
		expect(() => buildLocalControlPayload({ command: "mic", behavior: "pushToTalk" })).toThrow("key phase");
	});

	it("builds guest toggle payloads with explicit targets", () => {
		expect(buildGuestCommandPayload({ command: "mic", behavior: "toggle" }, "guest123")).toEqual({
			action: "mic",
			target: "guest123",
			value: "toggle"
		});
	});

	it("builds guest transfer payloads without coercing room names", () => {
		expect(buildGuestCommandPayload({ command: "forward", value: "room-01" }, "2")).toEqual({
			action: "forward",
			target: "2",
			value: "room-01"
		});
	});

	it("builds queued guest activation payloads", () => {
		expect(buildGuestCommandPayload({ command: "activateQueuedGuest" }, "guest123")).toEqual({
			action: "activateQueuedGuest",
			target: "guest123"
		});
	});

	it("omits values for guest press-only commands", () => {
		expect(buildGuestCommandPayload({ command: "hangup", behavior: "toggle" }, "guest123")).toEqual({
			action: "hangup",
			target: "guest123"
		});
	});

	it("defaults unknown guest commands to mic", () => {
		expect(getGuestCommandDefinition("missing").action).toBe("mic");
	});

	it("builds guest scene toggles for custom scene names", () => {
		expect(buildGuestScenePayload({ scene: "custom-scene", mode: "toggle" }, "guest123")).toEqual({
			action: "addScene",
			target: "guest123",
			value: "custom-scene"
		});
	});

	it("uses the legacy fixed-scene API shape when forcing a scene on", () => {
		expect(buildGuestScenePayload({ scene: "2", mode: "on" }, "guest123")).toEqual({
			action: "addScene2",
			target: "guest123",
			value: false
		});
		expect(buildGuestScenePayload({ scene: "1", mode: "on" }, "guest123")).toEqual({
			action: "addScene",
			target: "guest123",
			value: false
		});
	});

	it("uses the legacy fixed-scene API shape when forcing a scene off", () => {
		expect(buildGuestScenePayload({ scene: "2", mode: "off" }, "guest123")).toEqual({
			action: "addScene2",
			target: "guest123",
			value: true
		});
	});

	it("uses observed state to force named scenes with the legacy toggle command", () => {
		expect(buildGuestScenePayload({ scene: "custom-scene", mode: "on" }, "guest123", false)).toEqual({
			action: "addScene",
			target: "guest123",
			value: "custom-scene"
		});
		expect(buildGuestScenePayload({ scene: "custom-scene", mode: "on" }, "guest123", true)).toBeNull();
		expect(() => buildGuestScenePayload({ scene: "custom-scene", mode: "off" }, "guest123")).toThrow("live scene state");
	});

	it("builds local PTZ relative payloads", () => {
		expect(buildPtzKeyPayloads({ scope: "local", control: "zoom", mode: "relative", direction: "positive", value: "0.2" })).toEqual([
			{
				action: "zoom",
				value: 0.2
			}
		]);
	});

	it("builds guest PTZ relative payloads with targets", () => {
		expect(buildPtzKeyPayloads({ scope: "guest", control: "pan", mode: "relative", direction: "negative", value: "0.25" }, "guest123")).toEqual([
			{
				action: "ptzPan",
				target: "guest123",
				value: -0.25
			}
		]);
	});

	it("builds absolute PTZ payloads with value2", () => {
		expect(buildPtzKeyPayloads({ scope: "guest", control: "tilt", mode: "absolute", value: "-0.5" }, "guest123")).toEqual([
			{
				action: "ptzTilt",
				target: "guest123",
				value: -0.5,
				value2: "abs"
			}
		]);
	});

	it("can disable guest autofocus before focus moves", () => {
		expect(buildPtzKeyPayloads({ scope: "guest", control: "focus", value: "0.1", disableAutofocus: true }, "guest123")).toEqual([
			{
				action: "ptzAutofocus",
				target: "guest123",
				value: false
			},
			{
				action: "ptzFocus",
				target: "guest123",
				value: 0.1
			}
		]);
	});

	it("builds guest autofocus payloads", () => {
		expect(buildPtzKeyPayloads({ scope: "guest", control: "autofocus", value: "off" }, "guest123")).toEqual([
			{
				action: "ptzAutofocus",
				target: "guest123",
				value: false
			}
		]);
	});

	it("builds local PTZ dial relative payloads from ticks", () => {
		expect(buildPtzDialPayloads({ scope: "local", control: "zoom", step: "0.05" }, 2)).toEqual([
			{
				action: "zoom",
				value: 0.1
			}
		]);
	});

	it("builds inverted guest PTZ dial payloads", () => {
		expect(buildPtzDialPayloads({ scope: "guest", control: "pan", step: "0.1", invert: true }, 3, "guest123")).toEqual([
			{
				action: "ptzPan",
				target: "guest123",
				value: -0.3
			}
		]);
	});

	it("builds guest PTZ dial autofocus push payloads", () => {
		expect(buildPtzDialPushPayloads({ scope: "guest", pushAction: "autofocusOn" }, "guest123")).toEqual([
			{
				action: "ptzAutofocus",
				target: "guest123",
				value: true
			}
		]);
	});

	it("rejects unsupported PTZ command combinations", () => {
		expect(() => buildPtzKeyPayloads({ scope: "guest", control: "exposure" }, "guest123")).toThrow("Guest-targeted exposure");
		expect(() => buildPtzKeyPayloads({ scope: "local", control: "autofocus" })).toThrow("Local autofocus");
		expect(() => buildPtzDialPayloads({ scope: "guest", control: "exposure" }, 1, "guest123")).toThrow("Guest-targeted exposure");
		expect(() => buildPtzDialPushPayloads({ scope: "local", pushAction: "autofocusOn" })).toThrow("guest target");
	});

	it("builds mixer layout payloads using user-facing layout numbers", () => {
		expect(buildMixerControlPayloads({ command: "layout", layout: "0" })).toEqual([
			{
				action: "layout",
				value: 0
			}
		]);
		expect(buildMixerControlPayloads({ command: "layout", layout: "3" })).toEqual([
			{
				action: "layout",
				value: 3
			}
		]);
	});

	it("builds guest slot assignment payloads with destination slot numbers", () => {
		expect(buildMixerControlPayloads({ command: "setGuestSlot", slot: "2" }, { target: "guest123" })).toEqual([
			{
				action: "setslot",
				target: "guest123",
				value: 2
			}
		]);
	});

	it("builds legacy-compatible per-guest mute-all payloads", () => {
		const streams = [{ streamID: "guestA", label: "A" }, { streamID: "guestB", UUID: "uuidB", label: "B" }];
		expect(buildMixerControlPayloads({ command: "muteAllGuests", muteBehavior: "on" }, { streams })).toEqual([
			{
				action: "mic",
				target: "guestA",
				value: false
			},
			{
				action: "mic",
				target: "uuidB",
				value: false
			}
		]);
		expect(buildMixerControlPayloads({ command: "muteAllGuests", muteBehavior: "off" }, { streams: [streams[0]] })).toEqual([
			{
				action: "mic",
				target: "guestA",
				value: true
			}
		]);
		expect(buildMixerControlPayloads({ command: "muteAllGuests", muteBehavior: "toggle" }, { streams: [streams[0]], allGuestsMuted: false })[0].value).toBe(false);
		expect(buildMixerControlPayloads({ command: "muteAllGuests", muteBehavior: "toggle" }, { streams: [streams[0]], allGuestsMuted: true })[0].value).toBe(true);
	});

	it("builds transfer-all fan-out payloads", () => {
		expect(
			buildMixerControlPayloads(
				{ command: "transferAllGuests", transferRoom: "room-2" },
				{ streams: [{ streamID: "guestA", label: "A" }, { streamID: "guestB", UUID: "uuidB", label: "B" }] }
			)
		).toEqual([
			{
				action: "forward",
				target: "guestA",
				value: "room-2"
			},
			{
				action: "forward",
				target: "uuidB",
				value: "room-2"
			}
		]);
	});

	it("builds local value dial volume payloads", () => {
		expect(buildValueDialPayload({ scope: "local", control: "volume", min: "0", max: "200" }, 125)).toEqual({
			action: "volume",
			value: 125
		});
	});

	it("builds guest value dial volume payloads", () => {
		expect(buildValueDialPayload({ scope: "guest", control: "volume", min: "0", max: "200" }, 75, "guest123")).toEqual({
			action: "volume",
			target: "guest123",
			value: 75
		});
	});

	it("builds value dial panning and bitrate payloads", () => {
		expect(buildValueDialPayload({ scope: "local", control: "panning" }, 45)).toEqual({
			action: "panning",
			value: 45
		});
		expect(buildValueDialPayload({ scope: "local", control: "bitrate" }, 3500)).toEqual({
			action: "bitrate",
			value: 3500
		});
		expect(buildValueDialPayload({ scope: "local", control: "bitrate" }, -1)).toEqual({
			action: "bitrate",
			value: -1
		});
	});

	it("builds all-stream buffer delay payloads with value2", () => {
		expect(buildValueDialPayload({ scope: "local", control: "bufferDelay", bufferApply: "all" }, 250)).toEqual({
			action: "setBufferDelay",
			value: 250,
			value2: "*"
		});
		expect(buildValueDialPayload({ scope: "local", control: "bufferDelay", bufferApply: "default" }, 250)).toEqual({
			action: "setBufferDelay",
			value: 250
		});
	});

	it("clamps and inverts value dial ticks", () => {
		expect(nextValueDialValue({ control: "volume", min: "0", max: "100", step: "10" }, 95, 1)).toBe(100);
		expect(nextValueDialValue({ control: "panning", min: "0", max: "180", step: "5", invert: true }, 90, 2)).toBe(80);
	});

	it("rejects unsupported guest value dial controls", () => {
		expect(() => buildValueDialPayload({ scope: "guest", control: "bitrate" }, 2500, "guest123")).toThrow("Guest value dials");
		expect(() => buildValueDialPayload({ scope: "guest", control: "volume" }, 100)).toThrow("requires a target");
	});
});
