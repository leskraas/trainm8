/**
 * Where the owner's FIT files live (#625): the private companion repository
 * `leskraas/trainm8-private`, cloned next to this one, never this public
 * repository. The files carry GPS tracks. Set `DETECTION_FIT_DIR` to read
 * them from elsewhere.
 */
export const FIT_DIR =
	process.env.DETECTION_FIT_DIR ?? '../trainm8-private/detection/fit'

/** The path of a corpus FIT file, from its name. */
export const fitPath = (name: string) => `${FIT_DIR}/${name}`
