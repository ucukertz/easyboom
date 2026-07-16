package colormatch

// TransferColorLab applies Reinhard et al. 2001 color transfer.
// src and ref are BGR byte slices (width*height*3). Returns new BGR slice.
func TransferColorLab(src, ref []byte, width, height int) []byte {
	n := width * height

	refL, refA, refB := convertToLAB(ref, n)
	rLMean, rLStd := meanStdDev(refL)
	rAMean, rAStd := meanStdDev(refA)
	rBMean, rBStd := meanStdDev(refB)

	srcL, srcA, srcB := convertToLAB(src, n)
	sLMean, sLStd := meanStdDev(srcL)
	sAMean, sAStd := meanStdDev(srcA)
	sBMean, sBStd := meanStdDev(srcB)

	dst := make([]byte, len(src))
	for i := 0; i < n; i++ {
		L := srcL[i] - sLMean
		if sLStd > 1e-6 {
			L *= rLStd / sLStd
		}
		L += rLMean

		a := srcA[i] - sAMean
		if sAStd > 1e-6 {
			a *= rAStd / sAStd
		}
		a += rAMean

		b := srcB[i] - sBMean
		if sBStd > 1e-6 {
			b *= rBStd / sBStd
		}
		b += rBMean

		off := i * 3
		dst[off], dst[off+1], dst[off+2] = labToBgr(L, a, b)
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
