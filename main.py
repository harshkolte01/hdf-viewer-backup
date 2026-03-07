import h5py
import numpy as np

output_file = "one_gb_3d_array_2.h5"

# 1 GiB of uint8 data
shape = (1024, 1024, 1024)
dtype = np.uint8
chunk_depth = 64

rng = np.random.default_rng()

with h5py.File(output_file, "w") as f:
    dset = f.create_dataset(
        "array3d",
        shape=shape,
        dtype=dtype,
        chunks=(chunk_depth, 1024, 1024),
        compression=None
    )

    for i in range(0, shape[0], chunk_depth):
        current_depth = min(chunk_depth, shape[0] - i)
        slab = rng.integers(
            0, 256,
            size=(current_depth, 1024, 1024),
            dtype=dtype
        )
        dset[i:i+current_depth, :, :] = slab

print(f"Created {output_file} with random dataset 'array3d' of shape {shape}")