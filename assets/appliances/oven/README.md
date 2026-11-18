# Built-in oven 0.1.0

The asset models a wall oven with a 0.55 m installation depth. Widths are 60, 75 and 90 cm. The compact enclosure is 45 cm high and the full-height enclosure is 60 cm high. The cutout describes the required opening in meters. The fascia, door and grip project in front of it.

Choose one to three wire racks, a bar or recessed pull, stainless/black/white finish and wear on the 0.05 grid. A seeded draw assigns racks to different levels on five pairs of runners. Racks travel half their depth. Each has eight cross-wires and a wider frame. A 5 cm cube spans the central wires. The enclosed equipment mass calibrates the total to 32–38 kg across widths.

The physical fascia has a five-position mode selector (off, bake, fan bake, grill, defrost) and a temperature selector (off at zero, then 50 to 250 °C in 25 °C steps). Each tick is aligned to clockwise rotation. The touch strip exposes five mode keys, temperature up/down, start and stop.

The lower hinge opens around +X to 1.57 rad. The inner glass face becomes a tray support. Real oven doors often use over-centre hinges. Here the simulator approximates their static balance with a linear spring sized to counter the open door’s gravity moment, viscous damping and dry friction. Spring stiffness is the open gravity moment divided by the upper-limit angle. Friction and damping coefficients are respectively 0.12 and 0.8 times that moment in SI units. These estimates describe the synthetic model.
