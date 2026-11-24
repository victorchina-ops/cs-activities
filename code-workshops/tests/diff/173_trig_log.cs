using System;

class Program
{
    static void Main()
    {
        for (int i = 1; i <= 12; i++)
        {
            double x = i * 0.7;
            Console.WriteLine(Math.Sin(x) + " " + Math.Cos(x) + " " + Math.Exp(x) + " " + Math.Sqrt(x) + " " + Math.Atan(x));
        }
    }
}
