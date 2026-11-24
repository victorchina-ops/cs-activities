using System;

class Program
{
    static void Main()
    {
        int x = 7;
        double d = x / 2;
        double e = x / 2.0;
        double f = (double)x / 2;
        double g = (double)(x / 2);
        Console.WriteLine(d);
        Console.WriteLine(e);
        Console.WriteLine(f);
        Console.WriteLine(g);
        Console.WriteLine(1 / 3 + 1 / 3.0);
        Console.WriteLine(10 / 4 * 2.0);
    }
}
