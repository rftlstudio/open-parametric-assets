# Changelog

## URDF and simulation v0.1

Adds optional URDF dataset export, Z-up rigid links with material-density inertia, and MuJoCo 3.3.7 acceptance checks. Both furniture assets expose material density in material userData.

Drawer cabinet v0.2.0 changes the joint contract to `clearance` and reduces travel to 75% of tray depth. The validator samples five poses for either joint type. Drawer record IDs and open-view references change with the asset version.


## 0.2.0

**Breaking reproducibility change.** The cabinet and dataset generator now use Mulberry32 initialized with the 32-bit MurmurHash3 finalizer. The dataset enumerates record seeds with a permuted counter. The same build command produces different samples, record IDs and file paths. To reproduce a 0.1.0 record, use the 0.1.0 generator and its lockfile.

The renderer uses fixed neutral key, fill and rim lights and subtle crease lines. All five existing view names are retained. The new `perspective_three_quarter` view uses a 35° vertical field of view and frames the closed asset at approximately 80% of the image. The example GLBs and PNG references were regenerated for this release.
