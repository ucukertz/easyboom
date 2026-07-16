package colormatch

import "math"

const (
	d65x = 0.95047
	d65y = 1.0
	d65z = 1.08883

	labThreshold = 6.0 / 29.0
	labCubed     = labThreshold * labThreshold * labThreshold
	labFactor    = 3.0 * labThreshold * labThreshold
	labOffset    = 4.0 / 29.0
)

func linearize(c float64) float64 {
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

func gammaCorrect(c float64) float64 {
	if c <= 0.0031308 {
		return 12.92 * c
	}
	return 1.055*math.Pow(c, 1.0/2.4) - 0.055
}

func fLab(t float64) float64 {
	if t > labCubed {
		return math.Cbrt(t)
	}
	return labFactor*t + labOffset
}

func fLabInv(t float64) float64 {
	if t > labThreshold {
		return t * t * t
	}
	return (t - labOffset) / labFactor
}

func bgrToLab(b, g, r byte) (L, a, bLab float64) {
	rl := linearize(float64(r) / 255.0)
	gl := linearize(float64(g) / 255.0)
	bl := linearize(float64(b) / 255.0)

	x := 0.4124564*rl + 0.3575761*gl + 0.1804375*bl
	y := 0.2126729*rl + 0.7151522*gl + 0.0721750*bl
	z := 0.0193339*rl + 0.1191920*gl + 0.9503041*bl

	fx := fLab(x / d65x)
	fy := fLab(y / d65y)
	fz := fLab(z / d65z)

	L = 116.0*fy - 16.0
	a = 500.0 * (fx - fy)
	bLab = 200.0 * (fy - fz)
	return
}

func labToBgr(L, a, bLab float64) (byte, byte, byte) {
	fy := (L + 16.0) / 116.0
	fx := a/500.0 + fy
	fz := fy - bLab/200.0

	x := d65x * fLabInv(fx)
	y := d65y * fLabInv(fy)
	z := d65z * fLabInv(fz)

	rl := 3.2404542*x - 1.5371385*y - 0.4985314*z
	gl := -0.9692660*x + 1.8760108*y + 0.0415560*z
	bl := 0.0556434*x - 0.2040259*y + 1.0572252*z

	r := clampByte(gammaCorrect(clamp01(rl)) * 255.0)
	g := clampByte(gammaCorrect(clamp01(gl)) * 255.0)
	b := clampByte(gammaCorrect(clamp01(bl)) * 255.0)
	return b, g, r
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func clampByte(v float64) byte {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return byte(math.Round(v))
}

func meanStdDev(data []float64) (mean, stddev float64) {
	n := float64(len(data))
	if n == 0 {
		return
	}
	sum := 0.0
	for _, v := range data {
		sum += v
	}
	mean = sum / n

	sumSq := 0.0
	for _, v := range data {
		d := v - mean
		sumSq += d * d
	}
	stddev = math.Sqrt(sumSq / n)
	return
}
