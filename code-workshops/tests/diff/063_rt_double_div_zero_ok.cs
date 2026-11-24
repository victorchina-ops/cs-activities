using System;

class Program
{
    static void Main()
    {
        double a = 5;
        int zero = 0;
        Console.WriteLine(a / zero);
        Console.WriteLine(-a / zero);
        Console.WriteLine(a % 0);
        Console.WriteLine(0.0 / zero);
    }
}
