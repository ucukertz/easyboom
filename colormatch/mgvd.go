package colormatch

const minStdDev = 1.0

// TransferColorLab applies Reinhard et al. 2001 color transfer.
// src and ref are BGR byte slices (width*height*3). Returns new BGR slice.
// darkThreshold is in CIELAB L units (0-100). Pixels with L below this keep their original color.
func TransferColorLab(src, ref []byte, width, height int, darkThreshold float64) []byte {
	n := width * height

	refL, refA, refB := convertToLAB(ref, n)
	rLMean, rLStd := meanStdDev(refL)
	rAMean, rAStd := meanStdDev(refA)
	rBMean, rBStd := meanStdDev(refB)

	srcL, srcA, srcB := convertToLAB(src, n)
	sLMean, sLStd := meanStdDev(srcL)
	sAMean, sAStd := meanStdDev(srcA)
	sBMean, sBStd := meanStdDev(srcB)

	sLStd = max(sLStd, minStdDev)
	sAStd = max(sAStd, minStdDev)
	sBStd = max(sBStd, minStdDev)

	dst := make([]byte, len(src))
	for i := 0; i < n; i++ {
		if darkThreshold > 0 && srcL[i] < darkThreshold {
			off := i * 3
			dst[off], dst[off+1], dst[off+2] = src[off], src[off+1], src[off+2]
			continue
		}

		L := (srcL[i]-sLMean)*(rLStd/sLStd) + rLMean
		a := (srcA[i]-sAMean)*(rAStd/sAStd) + rAMean
		b := (srcB[i]-sBMean)*(rBStd/sBStd) + rBMean

		if L < 0 {
			L = 0
		} else if L > 100 {
			L = 100
		}
		if a < -128 {
			a = -128
		} else if a > 127 {
			a = 127
		}
		if b < -128 {
			b = -128
		} else if b > 127 {
			b = 127
		}

		off := i * 3
		nb, ng, nr := labToBgr(L, a, b)

		// Reject artifacts: pixel is strongly primary-dominated AND far from original.
		// The Reinhard formula amplifies noise along one LAB axis, which
		// maps to a dominant primary channel in RGB for dark/near-uniform frames.
		dominant := int(nr) + int(ng) + int(nb)
		isPrimaryDominated := false
		if dominant > 0 {
			if int(nr)*3 > dominant && nr > 60 {
				isPrimaryDominated = true
			} else if int(ng)*3 > dominant && ng > 60 {
				isPrimaryDominated = true
			} else if int(nb)*3 > dominant && nb > 60 {
				isPrimaryDominated = true
			}
		}

		if isPrimaryDominated {
			dr := float64(nr) - float64(src[off+2])
			dg := float64(ng) - float64(src[off+1])
			db := float64(nb) - float64(src[off])
			if dr*dr+dg*dg+db*db > 3600 { // Euclidean distance > 60 from original
				dst[off], dst[off+1], dst[off+2] = src[off], src[off+1], src[off+2]
				continue
			}
		}

		// Reject pixels whose total brightness more than doubled
		origTotal := int(src[off]) + int(src[off+1]) + int(src[off+2])
		if origTotal > 0 && int(nr)+int(ng)+int(nb) > origTotal*3/2 {
			dst[off], dst[off+1], dst[off+2] = src[off], src[off+1], src[off+2]
			continue
		}

		dst[off], dst[off+1], dst[off+2] = nb, ng, nr
	}
	return dst
}

func convertToLAB(data []byte, n int) (l, a, b []float64) {
	l = make([]float64, n)
	a = make([]float64, n)
	b = make([]float64, n)
	for i := 0; i < n; i++ {
		off := i * 3
		l[i], a[i], b[i] = bgrToLab(data[off], data[off+1], data[off+2])
	}
	return
}
