// Shared contracts between the engine's parts. Pure data, no DOM, runs in Node and the browser.
// The scene sampler fills a DrawList each frame; the renderer draws it. Nothing else crosses that line.
//
// Coordinates: plan units "u", x right, y toward the viewer, z up from the stage floor (z = 0).
// Colours: "#rrggbb" sRGB hex, or [r, g, b] / [r, g, b, a] sRGB floats in 0..1.

/**
 * @typedef {Object} Label             text printed on the top face of a slab
 * @property {string} text
 * @property {"mono"|"sans"} [font]    default "mono"
 * @property {number} [weight]         100..900, default 500
 * @property {number} [size]           cap-height-ish size in u (font size in u), default SIZE.tile.label
 * @property {string|number[]} [color]
 * @property {"center"|"left"|"right"} [align]  default "center"
 * @property {number} [dx]             offset on the top face, u, in the slab's local frame (x right)
 * @property {number} [dy]             offset on the top face, u, (y toward the viewer)
 * @property {number} [opacity]        0..1, default 1
 * @property {boolean} [engrave]       true: cut into the surface (darker, inner shadow); false: printed ink
 * @property {number} [tracking]       letter spacing in em, default 0
 * @property {boolean} [upper]         uppercase it
 */

/**
 * @typedef {Object} Slab              the one solid primitive: an extruded rounded rectangle with a bevelled top edge.
 *                                     r = min(w, d) / 2 makes a pill; r = w / 2 = d / 2 makes a disc or puck.
 * @property {string} [id]             entity id for picking and hover
 * @property {number} x                centre of the footprint
 * @property {number} y
 * @property {number} [z]              height of the bottom face above the floor, default 0
 * @property {number} w                size along x
 * @property {number} d                size along y
 * @property {number} h                height
 * @property {number} [r]              plan corner radius
 * @property {number} [bevel]          radius of the rounded top edge (<= min(r, h))
 * @property {number} [yaw]            rotation about z, degrees
 * @property {number} [pitch]          tilt about the slab's local x axis, degrees (for hops and flips)
 * @property {number} [roll]           tilt about the slab's local y axis, degrees
 * @property {number} [scale]          uniform scale about the footprint centre, default 1
 * @property {string|number[]} color   body colour (top face colour; sides are shaded from it)
 * @property {"matte"|"ceramic"|"glass"|"metal"} [material]
 * @property {number} [emissive]       self-illumination of the whole body, 0..4 (HDR; > 1 blooms)
 * @property {string|number[]} [emissiveColor]  defaults to color
 * @property {number} [rim]            0..1 emissive catch-light on the bevel and silhouette (attention)
 * @property {number} [opacity]        0..1
 * @property {number} [desaturate]     0..1 (dead or disabled things)
 * @property {Label} [label]
 * @property {Label} [label2]          second line or the outgoing text during a value roll
 * @property {{x:number, y:number, w:number, d:number, r:number, depth:number, lip?:number, color?:string|number[]}} [well]
 *                                     a real recess cut into the top face: a rounded-rect hole centred at (x, y) in the slab's
 *                                     local top-face frame (origin at the footprint centre), with inner walls and its own floor
 *                                     at h - depth; `lip` rounds the hole's edge; `color` tints the well floor
 * @property {{x:number, y:number, w:number, d:number, value:number, color?:string|number[]}} [meter]
 *                                     a progress inlay on the top face, in local top-face coordinates (centre origin)
 * @property {number} [outline]        0..1 selection ring drawn on the floor around the footprint
 * @property {boolean} [shadow]        casts a shadow, default true
 * @property {number} [light]          > 0 makes this slab a point light of that radius (u), coloured emissiveColor
 */

/**
 * @typedef {Object} Groove            an inlaid line in the floor (or on a housing top when z > 0)
 * @property {string} [id]
 * @property {number[][]} points       [[x, y], ...] polyline, corners already rounded by the caller
 * @property {number} [z]              height of the surface it is cut into, default 0
 * @property {number} [width]          default SIZE.trace.w
 * @property {"groove"|"rail"|"wire"|"print"} [style]
 *                                     groove: cut channel; rail: raised strip; wire: raised round cable; print: flat ink line
 * @property {string|number[]} [color] channel colour, default theme groove
 * @property {number} [glow]           0..4 emissive along the whole line
 * @property {string|number[]} [glowColor]
 * @property {{s0:number, s1:number, color:string|number[], intensity:number}[]} [pulses]
 *                                     lit stretches by arc length (u from the first point): packet trails, active spans.
 *                                     Intensity falls off from s1 (head, brightest) back to s0 (tail, zero).
 * @property {number[]} [dash]         [on, off] in u; animated by flow
 * @property {number} [flow]           dash phase speed, u/s (time comes from render options)
 * @property {number} [opacity]
 * @property {number} [grow]           0..1, draw only the first fraction of the length (lines that grow)
 */

/**
 * @typedef {Object} Zone              a printed region on the floor: groups, data centres, partitions, boards
 * @property {string} [id]
 * @property {number} x                centre
 * @property {number} y
 * @property {number} w
 * @property {number} d
 * @property {number} [r]
 * @property {string|number[]} [fill]
 * @property {string|number[]} [border]
 * @property {"solid"|"dashed"} [borderStyle]
 * @property {number} [borderWidth]    u, default 1
 * @property {string} [title]          engraved at the top-left corner, mono uppercase
 * @property {number} [opacity]
 */

/**
 * @typedef {Object} Text              text lying flat on a horizontal plane (floor rulers, lane names, zone captions)
 * @property {string} [id]
 * @property {number} x
 * @property {number} y
 * @property {number} [z]
 * @property {string} text
 * @property {"mono"|"sans"} [font]
 * @property {number} [weight]
 * @property {number} [size]
 * @property {string|number[]} [color]
 * @property {"center"|"left"|"right"} [align]
 * @property {"middle"|"top"|"bottom"} [baseline]
 * @property {number} [yaw]
 * @property {number} [opacity]
 * @property {number} [tracking]
 * @property {boolean} [upper]
 */

/**
 * @typedef {Object} Ticks             a ruler printed on the floor: ticks along a line, every `every` u, every `major`-th one longer
 * @property {number} x
 * @property {number} y
 * @property {number} length
 * @property {"x"|"y"} [axis]
 * @property {number} [every]
 * @property {number} [major]
 * @property {number} [size]           minor tick length, u
 * @property {"both"|"near"|"far"} [side]
 * @property {string|number[]} [color]
 * @property {number} [opacity]
 * @property {number} [z]
 */

/**
 * @typedef {Object} Light             an extra point light (the renderer also makes lights from slabs with `light`)
 * @property {number} x
 * @property {number} y
 * @property {number} [z]
 * @property {string|number[]} color
 * @property {number} intensity
 * @property {number} radius
 */

export class DrawList {
  constructor() { this.clear(); }
  clear() {
    this.slabs = []; this.grooves = []; this.zones = []; this.texts = []; this.ticks = []; this.lights = [];
    this.bounds = null;          // optional {minX, minY, maxX, maxY} of everything, set by the sampler
    return this;
  }
  /** @param {Slab} s */   slab(s) { this.slabs.push(s); return s; }
  /** @param {Groove} g */ groove(g) { this.grooves.push(g); return g; }
  /** @param {Zone} z */   zone(z) { this.zones.push(z); return z; }
  /** @param {Text} t */   text(t) { this.texts.push(t); return t; }
  /** @param {Ticks} t */  tick(t) { this.ticks.push(t); return t; }
  /** @param {Light} l */  light(l) { this.lights.push(l); return l; }
  get size() { return this.slabs.length + this.grooves.length + this.zones.length + this.texts.length + this.ticks.length; }
}

/**
 * @typedef {Object} Camera
 * @property {number[]} target   [x, y, z] the point looked at
 * @property {number} distance   from target, u
 * @property {number} yaw        degrees; 0 looks from +y (the viewer side) toward -y
 * @property {number} pitch      degrees above the horizon; 90 is straight down
 * @property {number} fov        vertical field of view, degrees
 */

/**
 * @typedef {Object} Frame        what the scene sampler returns for one instant
 * @property {Object[]} poses    semantic poses (CONTRACTS.md section 4.6); engine/gfx/skin.mjs turns them into a DrawList
 * @property {number} time       playhead, seconds at 1x
 * @property {number} step       index of the step under the playhead
 * @property {number} u          0..1 progress through that step
 * @property {string} caption    narration markup of the step (see CONTRACTS.md, "Narration markup")
 * @property {string} phase      chapter name
 * @property {{id:string, text:string, tone?:string, at:number[], opacity:number}[]} tags   DOM chips anchored to world points
 * @property {{minX:number, minY:number, maxX:number, maxY:number, minZ?:number, maxZ?:number}} focus  what the camera should frame
 * @property {{minX:number, minY:number, maxX:number, maxY:number}} world   bounds of the whole scene
 * @property {Object<string, number>} counters
 * @property {number[]|null} line     active code lines [from, to], 1-based
 * @property {Map<string, Object>} entities   id -> {kind, title, tone, state} for the inspector
 * @property {Object|null} ask        a pending prediction question {question, options, answer}
 */
