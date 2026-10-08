# Glome: physics

The laws of the universe, the numbers, and an honest list of where the game approximates. Pillar one of the [design](DESIGN.md) is that nothing is faked: an approximation may integrate a law numerically, but it may never swap in a different law.

## Space

Space is **R³ × S¹**: coordinates (x, y, z, w) with w identified with w + L, so one direction closes into a circle of circumference **L = 800 m** (the hoop). Time is ordinary. Light and objects travel in straight lines that wrap round the hoop.

Planets and the star are 4D balls. The ground of a planet is its boundary, a 3-sphere: a curved, finite 3D space with no edge. Walk straight on planet A and you return after 2π·250 m ≈ 1571 m.

## Gravity

**In 4D,** Gauss's law spreads a mass's field over a 3-sphere of area 2π²r³, so the pull falls as **1/r³**. With G₄ absorbing the constants:

  g(r) = G₄M / r³,  Φ(r) = −G₄M / (2r²).

**In the hoop**, a mass is felt together with all its images at w + kL. The sum has a closed form. With ρ the distance in the three open directions and w the offset round the hoop:

  Φ(ρ, w) = −(G₄M/2) Σₖ 1/(ρ² + (w − kL)²)
      = −(π G₄M / (2Lρ)) · sinh(2πρ/L) / (cosh(2πρ/L) − cos(2πw/L)).

The force is the gradient of this. The game uses the formula directly: there is no cutoff and no truncated sum.

- **Near a body** (ρ, |w| ≪ L), gravity is fully 4D: 1/r³.
- **Far from it** (ρ ≳ L), the hoop is too small to matter. Gravity becomes 3D-like, Φ → −G₃M/ρ with **G₃ = πG₄/(2L)**, and the corrections die off as e^(−2πρ/L).
- **Inside a uniform 4D ball,** the shell theorem holds in 4D: g = G₄M r / R⁴.

### What this does

- **In pure 4D space, no orbit holds.** In the 4D near field the effective potential (ℓ² − G₄M)/(2r²) has no minimum. A circular orbit exists only at exactly v = √(G₄M)/r, which is also the escape speed, and any nudge sends the body spiralling in or out.
- **The hoop adds a faint cradle.** Near a body (r ≪ L), the pull of its images expands to Φ_img ≈ const + κ(ρ² − 3w²), with κ = G₄M ζ(4)/L⁴ = G₄M π⁴/(90 L⁴). This is a gentle trap in the three open directions and a gentle push along the hoop (it is harmonic, as it must be in empty space).
  - **Orbits lying flat across the hoop** (in a 3D space w = const) are therefore weakly stable. Their radial oscillation frequency is √(8κ), a period of about 110 s for planet A.
  - **Orbits tilted into the hoop** fail.
  - **Checked by direct integration:** circular orbits 100 m up on planet A, each given a 1 m/s nudge. Across the hoop the orbit stays between 328 and 373 m for at least 10 minutes. Tilted into the hoop it hits the ground in 22 s. Without the hoop (pure 4D) it drifts out steadily, 350 → 950 m in 10 minutes.
  - **On planet A**, the circular speed is 49.9 m/s at the surface and 36 m/s at 100 m up. Because the planet double-rotates, the launch direction that lies across the hoop drifts through the day.
- **Stable orbits far away.** Beyond about L, gravity is 3D-like, so Kepler orbits are stable. That is how the planets orbit the star.
- **Lighter summits.** Gravity falls by (R/r)³: on a 40 m peak it is 6.3 m/s², 36% lighter than at sea level.
- **Gravity varies over the planet.** A's own images pull on it. Where "up" points along the hoop, surface gravity is 8.5% lighter (8.96 m/s²); where it points across, 1.7% heavier (9.97 m/s²). The planet's double spin carries these light zones across the land during the day.
- **Tides** from the star are 0.09 m/s² (0.9% of g).
- **In the planet's frame,** where you walk, everything also feels the spin: a centrifugal pull of up to 0.11 m/s² from the slow plane and 0.29 m/s² from the fast one (at most 2.9% of g), and the Coriolis force on anything moving. The game integrates the exact free-particle acceleration in that frame, a_b = (M S)ᵀ(g − a_A) − W²x − 2Wv: the gravity of the star, A and B with all their images, minus A's own orbital acceleration (which leaves the tides), plus the two spin terms. Measured at the start: 8.89 m/s² (a light zone, 8 m up).

## Light

A point source in 4D spreads over a 3-sphere, so intensity falls as **1/r³**. A lantern lights a small, sharp pool.

A distant source is seen together with its images round the hoop. From planet A the star (2 km away) appears as a **row of suns** along the hoop direction: the main image, then images at 21.8°, 38.7° and 50.2° from it, and so on toward 90°, each fainter (1/d³). Sunlight is the sum over that row. Far from a source the row's total falls as 1/ρ², the 3D-like law again.

Looking along the hoop you see copies of everything, including your own planet, 800 m away (17.4° in radius) and again at 1600 m, and so on.

## Sound

Sound obeys the wave equation in four space dimensions. Amplitude falls as **r^(−3/2)**. Because the number of space dimensions is even, a sharp sound is not followed by silence: the wave's response fills the inside of its light cone, so a click arrives with a faint tail that decays after it. (In odd dimensions, like ours, Huygens' principle makes sounds sharp.)

- **The Green's function,** from the dimensional recursion G₄ = −(1/2πr)∂G₂/∂r with G₂ = θ(ct − r)/(2πc√(c²t² − r²)): a singular front on the cone plus a tail −(1/4π²c)(c²t² − r²)^(−3/2) inside it. Checked numerically in tools/test-audio.mjs (to 5·10⁻¹¹ against an independent G₂).
- **For a 1 ms click,** the front falls as r^(−1.53) over 2–400 m (−1.5 in the far field), and 5 ms after the front the tail is −0.5% (2 m), −0.8% (10 m) and −1.0% (50 m) of the front's peak: negative, a faint rarefaction, decaying as t⁻³.
- **In the game,** each sound is delayed by r/c (c = 343 m/s), scaled by r^(−3/2) and panned by your right axis (ears, 4D or not, sit left and right); the tail is added by convolving with that response from 2.5 ms after the front on (precomputed for 3, 12, 48 and 192 m).
- **Approximation:** the far-field front also carries an amplitude rise ∝ √frequency (the half-derivative of even dimensions). Taken literally that is +30 dB across the audible range; the game uses a gentle +3.5 dB high shelf instead, the same sign, tamed.

## Rigid bodies

- **State:** position x (wrapped round the hoop), velocity v, orientation in SO(4), and angular velocity ω.
- **Angular velocity** in 4D is a bivector: a rotation rate in each of the six planes xy, xz, xw, yz, yw, zw. A body generally spins in two independent planes at once (a double rotation) with no fixed axis.
- **Orientation** is stored as a pair of unit quaternions (q_L, q_R) acting as x ↦ q_L x q_R, because SO(4) ≅ (S³ × S³)/±1. The bivector splits into two 3-vectors ω₊ and ω₋ (its self-dual and anti-self-dual parts), and the exact update is q_L ← exp(ω₊ dt/2) q_L, q_R ← q_R exp(ω₋ dt/2).
- **Inertia.** For the symmetric shapes we use, angular momentum is a scalar multiple of ω:
  - a uniform 4D ball of radius r: I = M r²/3 (each ⟨x_i²⟩ = r²/6);
  - a uniform tesseract of side s: I = M s²/6.
- **Contacts:**
  - signed distance functions for the terrain (the heightfield on S³ plus carved landforms), and analytic tests between bodies;
  - impulses with Coulomb friction, μ = 0.9 for rock;
  - sequential impulses with several iterations, so stacks stand;
  - resting bodies sleep.
- **Time step:** fixed at 1/120 s.
- **In the game** (js/bodies.js, tests in tools/test-bodies.mjs): the impulse J at offset r changes ω by (J ∧ r)/I, checked against the energy change J·v. Densities are 4D (kg/m⁴): stone 2600, metal 7800, wood 450, water 1000, so stone sinks and wood floats. Contacts: ball–ball and ball–tesseract exactly; tesseract–tesseract by separating axes over the eight face normals with the incident box's vertices clamped onto the reference face (edge-on contacts are approximate); against the ground by the 16 vertices. Measured: a free tumbling tesseract keeps L and E to 10⁻⁹; a stack of three stands 30 s with < 0.1 mm drift on a sphere; collisions conserve P and L to 10⁻¹⁴; buoyancy floats a half-density ball exactly half under.
- **Rolling resistance** (an approximation): soft ground gives under a rolling ball, which rigid-body contact cannot model, so a ball on the ground feels a drag of 0.08 × its normal force. Without it balls roll forever on the gentlest slope.
- **Water drag** (an approximation): bodies in water lose speed and spin at a rate of 1.5/s times the mass of water they displace over their own mass, so anything afloat settles alike, and a sinking stone is slowed less.
- **Holding** is physical: what you hold stays an ordinary body, colliding with the ground and with other things. Each step a drive pulls it toward a point before your eyes (lower for bigger things) and turns it toward a fixed attitude to your body: it brings it to the velocity your hands have plus a share of the gap (closing it with a time constant of 0.04 s, after gravity), and turns it at your body's rate plus a share of the remaining rotation (the logarithm in SO(4), time constant 0.05 s). The drive is limited to 2600 N and 400 N·m, so a 13 kg ball tracks your hands to a few centimetres while a 163 kg block comes up in about half a second, sags and swings when you turn. Its reaction is applied to you, so holding conserves momentum (in flight, swinging what you hold moves you). If it snags a metre from your hands and isn't coming closer, you let go after 0.4 s.
- **Throwing** conserves momentum exactly: an object of mass m leaving at speed u relative to you (mass M) changes your velocity by −u·m/(M + m). An impulse stone (2.5 kg) always leaves at 80 m/s, so each one is worth 2.76 m/s to a 70 kg you.

## The player

A 4D capsule from 0.3 m to 1.75 m along the local up, radius 0.3 m.
- **Walking:** a velocity controller standing in for feet that grip the ground. In the air you are ballistic, except within 2.5 m of the ground, where a little steering stands in for the twist a jumper can make (a mercy; higher up, flight is purely ballistic).
- **Water:** you cannot swim. Wading slows you as the water deepens (to 35% of your speed); past chest depth (1.3 m) you fade back to the last dry ground you stood on.
- **Contacts:** full 4D normals with Coulomb friction. A push within about 42° of head-on sticks; a glancing one slides, through ana if that is where the surface leans.
- **Climbing:** holding Space against a boulder moves you up its surface along the steepest 4D ascent.

## Boats

- **Floating** is the displaced 4-volume times the water's density and the local gravity, applied at the centre of buoyancy, so it also rights (or tips) the raft. For a tesseract the volume is summed over 4⁴ sub-cells, each wet in proportion to its depth below the surface (taken as flat across the body); exact for a level body, close for a tilted one. A uniform cube floats square only below about 0.21 of water's density (BM = s²/12d against KG − KB = (s − d)/2: the same rule in 4D as in 3D); between that and 0.79 it settles on an edge (tools/test-bodies.mjs checks both). The raft is a hollow crate of mean density 60, drawing 8 cm.
- **The keel and hull** (an approximation: a drag of 20·u + 40·u|u| N along the heading and ten times that in each sideways direction, u the speed through the water that way); **the sail** (square-rigged): a force along the heading of 34·w|w| N, w the relative wind along the heading; the raft's own windage 1·|w|·w N. The wind turns slowly over hours. The raft sails at 2.8 m/s in a 6 m/s wind.
- **Standing on a moving body:** its support is straight up and you move with the point under your feet (static friction, not modelled force by force); walking eases your velocity relative to it.

## Ropes

A chain of particles with distance constraints (position-based dynamics) that collides with the terrain and bodies. In 4D a rope can always pass another rope or itself by moving through ana, because a 1D curve cannot block another 1D curve there. So a knot never holds.

- **Checked** (tools/test-rope.mjs): a knot is held by its crossings, so the test makes one crossing and presses one strand down through the other. Confined to a 3D slice, the upper strand stays above (the crossing holds). Free in 4D, with the strands a hair (2 mm) off any single slice, it ends 0.42 m below, and the closest the two strands ever come is exactly their touching distance (0.0600 m for 0.03 m radius): it slipped round through ana without passing through anything. Any crossing can be changed this way, so no knot can hold.
- **Seen in a slice,** a rope is a few dots: a curve meets a 3D slice only at points. You see a stretch of it only where it lies in your slice.

## Landforms and trees

- **Hollows** are 4D capsules and balls subtracted from the ground, in the renderer and the physics alike (the walker finds the floor of a hollow below the ground's surface). The cave's only tunnel leaves its chamber toward ana from the path that leads there; there is also an arch through an island and an overhang on the massif.
- **Trees** are 4D capsules (branches spreading in all three ground directions) and balls (foliage), traced exactly. A slice cuts a branch only where the branch crosses it, so most views of a tree are floating pieces.

## Creatures

- **Bodies** are dynamic 4D rigid bodies.
- **Gaits** are kinematic: feet are placed by rule, then the body is carried by them.
- **Walkers** stand on a tetrahedron of four feet, the smallest stable stance on 3D ground, and walk on two alternating tetrapods (eight legs).
- **Rollers** are duocylinders rolling in two planes at once.
- **In the game:** a walker's eight hips are the corners of its body's bottom cell (a cube), which split into two tetrahedra: the two tetrapods. A slice through a walker's middle misses every leg (they all lie off-centre toward ana or kata), so you see legs only as it moves off your slice. A roller is drawn exactly (a ray is inside a duocylinder while it is inside both solid cylinders), but its rolling is kinematic: it turns in its two planes at rates set by its speed. Populations: walkers gain energy on grass and are born when well fed, if their herd has room; rollers live on sunlight; both age and die.

## The system (toy scale, tunable)

| | Value |
|---|---|
| Hoop length L | 800 m |
| Planet A | radius 250 m, surface gravity 9.8 m/s², G₄M = 1.53×10⁸ m⁴/s² |
| Planet A: circular speed at the surface | 49.5 m/s in pure 4D, 49.9 m/s with the hoop |
| Planet A: escape speed (exact, hoop included) | 56.5 m/s |
| Planet A: day | its double spin, 300 s in one plane, 300/φ s in the other (φ is the golden ratio) |
| The star | radius 120 m, about 5 × A's mass, surface gravity 404 m/s² |
| A's orbit | radius 2 km, year 8 min, speed 26 m/s |
| Planet B | radius 120 m, surface gravity 6 m/s², escape speed 27.8 m/s |
| B's orbit | radius 3.2 km, year 16 min, speed 21 m/s |
| A → B (minimum-energy transfer) | about 5 m/s beyond escape, 6 min coast; a launcher gives much faster arcs |
| A's sphere of influence (3D far-field estimate) | about 840 m from its centre |
| Launcher, straight up from A (sea level) | 30 m/s → 62 m · 40 m/s → 160 m · 45 m/s → 282 m · 49.5 m/s → 565 m · 52 m/s → 985 m · 56.5 m/s escapes |
| From the massif's summit (46 m, where the launcher stands) | gravity 6.1 m/s² · a 60 m hop 23.7 m/s · a 200 m arc 34.7 m/s · circular across the hoop 42.4 m/s · escape 49.7 m/s · the spin carries the summit at 6.4 m/s. The launcher's tiers: 24, 35, 43, 52 m/s (tier II measured in the game: 203 m). |
| Planet B (120-cell, floors at 115 m) | escape 28 m/s; its return pad gives 33 m/s; a tier IV launch aimed by the space map lands on B after 90–120 s |
| The sun from A | 3.4° in radius, with images along the hoop at 21.8°, 38.7°, 50.2°, … |

## Approximations, honestly

- **Terrain** is a heightfield on S³ plus a few carved landforms. Real 4D ground could overhang anywhere; ours does only at designed places.
- **Rivers** are still water in carved channels (0.5 m deep), not a fluid simulation: they do not flow.
- **Planet B** is a 120-cell (floors 115 m from its centre, corners 124 m), but its gravity is that of a uniform ball of radius 120 m.
- **Flight** is a kick-drift-kick leapfrog in the inertial frame at 1/120 s; the space map predicts with the same integrator at 0.02–0.1 s steps. Leaving and landing switch frames exactly (the conversions are rotations and translations).
- **Planet orbits are prescribed circles.** For these masses and radii, the integrated two-body motion would be these same circles. The planets' spins are prescribed too. Small bodies (you in flight, thrown objects) are integrated in the exact field of the star and both planets, images included.
- **No atmosphere.** No drag, no aerodynamic heating, and landings are gentle by fiat (a deliberate mercy). The sky's colour is artistic, not scattered light.
- **Light** is direct light with soft shadows and an ambient term. There is no multiple bouncing.
- **Creature gaits** are kinematic, as above.
- **Holding's reaction** reaches you as a change of velocity only: you have no rotational state of your own, so the drive's turning impulse is not felt back (angular momentum isn't conserved between you and what you hold).
- **The planets' masses** are their bare balls (radius 250 m and 120 m). The terrain relief (−20 to +48 m) adds no mass of its own, and its pull is not computed.
- **The planets' orbits and spins are prescribed** from the true laws: the console's dials change how you and your objects move, not the planets.
