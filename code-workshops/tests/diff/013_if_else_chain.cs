using System;

class Program
{
    static void Main()
    {
        int x = int.Parse(Console.ReadLine());
        if (x < 0) Console.WriteLine("neg");
        else if (x == 0) Console.WriteLine("zero");
        else if (x < 10) Console.WriteLine("small");
        else Console.WriteLine("big");
        if (x > 5) { Console.WriteLine("gt5"); } else { Console.WriteLine("le5"); }
    }
}
